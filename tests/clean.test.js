import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clean, createCleaner, matchesBuildDir } from '../scripts/clean.mjs'

let fixture
let root

beforeEach(async () => {
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'geek-clean-'))
  root = path.join(fixture, 'workspace')
  await fs.mkdir(root)
})

afterEach(async () => {
  await fs.rm(fixture, { recursive: true, force: true })
})

async function write(relative, text = 'cache') {
  const absolute = path.join(root, relative)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, text)
  return absolute
}

describe('safe local cleanup', () => {
  it('only recognizes the documented release-build directory names', async () => {
    expect(matchesBuildDir('release-build')).toBe(true)
    expect(matchesBuildDir('release-build-test')).toBe(true)
    expect(matchesBuildDir('release-builder-source')).toBe(false)
    expect(matchesBuildDir('release-buildnotes')).toBe(false)
    await fs.mkdir(path.join(root, 'release-builder-source'))
    await fs.mkdir(path.join(root, 'release-build-test'))
    await write('release-build-notes.txt')
    const targets = await (await createCleaner(root)).collectTargets()
    expect(targets).toContain('release-build-test')
    expect(targets).not.toContain('release-builder-source')
    expect(targets).not.toContain('release-build-notes.txt')
  })

  it('does not count nested cache targets twice with --all', async () => {
    const targets = await (await createCleaner(root)).collectTargets(true)
    expect(targets).toContain('node_modules')
    expect(targets).not.toContain('node_modules/.vite')
  })

  it('rejects the root, absolute paths and traversal outside the workspace', async () => {
    const cleaner = await createCleaner(root)
    for (const target of ['', '.', '..', '../outside', path.join(fixture, 'outside')]) {
      await expect(cleaner.inspect(target)).rejects.toThrow()
    }
  })

  it('removes generated files while retaining source and unrelated directories', async () => {
    await write('dist/cache.js', '12345')
    const source = await write('src/main.js', 'source')
    const unrelated = await write('release-builder-source/main.js', 'keep')
    const io = { log: vi.fn() }
    expect(await clean({ root, argv: [], io })).toBe(0)
    await expect(fs.lstat(path.join(root, 'dist'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readFile(source, 'utf8')).toBe('source')
    expect(await fs.readFile(unrelated, 'utf8')).toBe('keep')
  })

  it('only unlinks a top-level directory link and does not size or delete its target', async () => {
    const outside = path.join(fixture, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep.txt'), 'external data')
    await fs.symlink(outside, path.join(root, 'dist'), process.platform === 'win32' ? 'junction' : 'dir')
    const cleaner = await createCleaner(root)
    expect(await cleaner.directorySize('dist')).toBe(0)
    expect(await cleaner.removeTarget('dist')).toEqual({ failed: [], removedBytes: 0 })
    expect(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('external data')
  })

  it('does not recurse through a directory link inside a generated directory', async () => {
    const outside = path.join(fixture, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'keep.txt'), 'external data')
    await fs.mkdir(path.join(root, 'dist'))
    await fs.symlink(outside, path.join(root, 'dist', 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const cleaner = await createCleaner(root)
    expect(await cleaner.directorySize('dist')).toBe(0)
    expect((await cleaner.removeTarget('dist')).failed).toEqual([])
    expect(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('external data')
  })

  it('refuses a cache path whose parent is a link outside the workspace', async () => {
    const outside = path.join(fixture, 'outside')
    await fs.mkdir(path.join(outside, '.vite'), { recursive: true })
    const preserved = path.join(outside, '.vite', 'keep.txt')
    await fs.writeFile(preserved, 'external data')
    await fs.symlink(outside, path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const cleaner = await createCleaner(root)
    await expect(cleaner.inspect('node_modules/.vite')).rejects.toThrow('父目录符号链接')
    expect((await cleaner.removeTarget('node_modules/.vite')).failed).toContain('node_modules/.vite')
    expect(await fs.readFile(preserved, 'utf8')).toBe('external data')
  })

  it('refuses a non-link entry when its canonical path resolves outside the workspace', async () => {
    const preserved = await write('dist/keep.txt', 'cache')
    const outside = path.join(fixture, 'outside')
    const fileSystem = {
      ...fs,
      realpath: async (absolute) => absolute === path.join(root, 'dist') ? outside : fs.realpath(absolute)
    }
    const cleaner = await createCleaner(root, fileSystem)
    await expect(cleaner.inspect('dist')).rejects.toThrow('实际路径位于工作区外')
    expect((await cleaner.removeTarget('dist')).failed).toEqual(['dist'])
    expect(await fs.readFile(preserved, 'utf8')).toBe('cache')
    expect(await clean({ root, argv: [], fileSystem, io: { log: vi.fn() } })).toBe(1)
  })

  it('retains a busy file target and returns a failing exit code', async () => {
    const locked = await write('install.log', 'locked')
    const fileSystem = {
      ...fs,
      unlink: async (absolute) => {
        if (absolute === locked) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
        return fs.unlink(absolute)
      }
    }
    const io = { log: vi.fn() }
    expect(await clean({ root, argv: [], fileSystem, io })).toBe(1)
    expect(await fs.readFile(locked, 'utf8')).toBe('locked')
    expect(io.log.mock.calls.flat().join('\n')).toContain('未完成，已保留失败路径')
    expect(io.log.mock.calls.flat().join('\n')).toContain('install.log')
  })

  it('reports blocked directories rather than silently claiming completion', async () => {
    const blocked = await write('dist/locked.js', 'locked')
    const fileSystem = {
      ...fs,
      unlink: async (absolute) => {
        if (absolute === blocked) throw Object.assign(new Error('denied'), { code: 'EACCES' })
        return fs.unlink(absolute)
      }
    }
    const result = await (await createCleaner(root, fileSystem)).removeTarget('dist')
    expect(result.failed).toContain(path.join('dist', 'locked.js'))
    expect(result.failed).toContain('dist')
    expect(result.removedBytes).toBe(0)
    expect(await fs.readFile(blocked, 'utf8')).toBe('locked')
  })

  it('does not mutate generated files during a dry run', async () => {
    const generated = await write('dist/cache.js', 'cache')
    expect(await clean({ root, argv: ['--dry'], io: { log: vi.fn() } })).toBe(0)
    expect(await fs.readFile(generated, 'utf8')).toBe('cache')
  })
})
