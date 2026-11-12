import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createZip } from '../shared/zip.js'
import { replaceInPlace } from '../server/webUpdate.js'

const serverScript = fileURLToPath(new URL('../server/serve.js', import.meta.url))
const tempDirs = new Set()
const childProcesses = new Set()

async function createTempDir(prefix = 'tb-serve-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.add(dir)
  return dir
}

async function getFreePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(child, port, getOutput) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server process exited: ${child.exitCode}; ${getOutput()}`)
    try {
      return await request(port, '/')
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
  throw new Error('server did not start in time')
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.once('error', reject)
  })
}

async function startServer(root, feed) {
  const port = await getFreePort()
  const output = []
  const child = spawn(process.execPath, [serverScript, '--root', root, '--feed', feed, '--port', String(port)], {
    cwd: path.dirname(serverScript),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TOOLBOX_WEB_UPDATE_LOG: path.join(path.dirname(root), 'server.log') }
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  childProcesses.add(child)
  await waitForServer(child, port, () => output.join(''))
  return { child, port }
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const child of childProcesses) {
    if (child.exitCode === null) child.kill()
  }
  childProcesses.clear()
  await Promise.all([...tempDirs].map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.clear()
})

describe('replaceInPlace', () => {
  it('restores the full previous tree after a failed update', async () => {
    const parent = await createTempDir()
    const root = path.join(parent, 'root')
    const staging = path.join(parent, 'staging')
    await fs.mkdir(path.join(root, 'assets', 'nested'), { recursive: true })
    await fs.mkdir(path.join(staging, 'assets'), { recursive: true })
    await fs.writeFile(path.join(root, 'index.html'), 'old index')
    await fs.writeFile(path.join(root, 'version.json'), '{"version":"1.0.0"}')
    await fs.writeFile(path.join(root, 'assets', 'old.js'), 'old asset')
    await fs.writeFile(path.join(root, 'assets', 'nested', 'old.css'), 'old nested asset')
    await fs.writeFile(path.join(staging, 'index.html'), 'new index')
    await fs.writeFile(path.join(staging, 'version.json'), '{"version":"2.0.0"}')
    await fs.writeFile(path.join(staging, 'assets', 'new.js'), 'new asset')

    const copyFile = fs.copyFile
    vi.spyOn(fs, 'copyFile').mockImplementation(async (from, to, ...args) => {
      if (path.resolve(from) === path.join(staging, 'assets', 'new.js')) {
        const error = new Error('simulated copy error')
        error.code = 'EIO'
        throw error
      }
      return copyFile(from, to, ...args)
    })

    await expect(replaceInPlace(staging, root)).rejects.toThrow(/已恢复完整旧版本/)

    expect(await fs.readFile(path.join(root, 'index.html'), 'utf8')).toBe('old index')
    expect(await fs.readFile(path.join(root, 'version.json'), 'utf8')).toBe('{"version":"1.0.0"}')
    expect(await fs.readFile(path.join(root, 'assets', 'old.js'), 'utf8')).toBe('old asset')
    expect(await fs.readFile(path.join(root, 'assets', 'nested', 'old.css'), 'utf8')).toBe('old nested asset')
    await expect(fs.access(path.join(root, 'assets', 'new.js'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.access(path.join(root, 'assets', 'old.js'))).resolves.toBeUndefined()
    expect((await fs.readdir(parent)).filter((name) => name.includes('.rollback-'))).toEqual([])
    await expect(fs.access(staging)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes the full staged version and removes its rollback snapshot when version.json was absent', async () => {
    const parent = await createTempDir()
    const root = path.join(parent, 'root')
    const staging = path.join(parent, 'staging')
    await fs.mkdir(path.join(root, 'assets'), { recursive: true })
    await fs.mkdir(path.join(staging, 'assets'), { recursive: true })
    await fs.writeFile(path.join(root, 'index.html'), 'old index')
    await fs.writeFile(path.join(root, 'assets', 'legacy.js'), 'legacy')
    await fs.writeFile(path.join(staging, 'index.html'), 'new index')
    await fs.writeFile(path.join(staging, 'version.json'), '{"version":"2.0.0"}')
    await fs.writeFile(path.join(staging, 'assets', 'app.js'), 'new app')

    await replaceInPlace(staging, root)

    expect(await fs.readFile(path.join(root, 'index.html'), 'utf8')).toBe('new index')
    expect(await fs.readFile(path.join(root, 'version.json'), 'utf8')).toBe('{"version":"2.0.0"}')
    expect(await fs.readFile(path.join(root, 'assets', 'app.js'), 'utf8')).toBe('new app')
    await expect(fs.access(path.join(root, 'assets', 'legacy.js'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await fs.readdir(parent)).filter((name) => name.includes('.rollback-'))).toEqual([])
    await expect(fs.access(staging)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes old files only after the complete staged tree has been copied', async () => {
    const parent = await createTempDir()
    const root = path.join(parent, 'root')
    const staging = path.join(parent, 'staging')
    await fs.mkdir(path.join(root, 'assets'), { recursive: true })
    await fs.mkdir(path.join(staging, 'assets'), { recursive: true })
    await fs.writeFile(path.join(root, 'index.html'), 'old')
    await fs.writeFile(path.join(root, 'assets', 'obsolete.js'), 'obsolete')
    await fs.writeFile(path.join(staging, 'index.html'), 'new')
    await fs.writeFile(path.join(staging, 'version.json'), '{"version":"2.0.0"}')
    await fs.writeFile(path.join(staging, 'assets', 'new.js'), 'new')

    await replaceInPlace(staging, root)

    expect(await fs.readdir(path.join(root, 'assets'))).toEqual(['new.js'])
    expect((await fs.readdir(parent)).filter((name) => name.includes('.rollback-'))).toEqual([])
  })
})

describe('Web static serving', () => {
  it('blocks files reached through external symlinks and serves contained files', async () => {
    const parent = await createTempDir()
    const root = path.join(parent, 'web-root')
    const outside = path.join(parent, 'outside')
    await fs.mkdir(root)
    await fs.mkdir(outside)
    await fs.writeFile(path.join(root, 'index.html'), 'inside index')
    await fs.writeFile(path.join(outside, 'secret.txt'), 'outside secret')
    await fs.symlink(outside, path.join(root, 'linked-dir'), process.platform === 'win32' ? 'junction' : 'dir')
    if (process.platform !== 'win32') {
      await fs.symlink(path.join(outside, 'secret.txt'), path.join(root, 'linked-file.txt'), 'file')
    }

    const { port } = await startServer(root, path.join(parent, 'missing-feed'))

    expect(await request(port, '/')).toMatchObject({ status: 200, body: 'inside index' })
    expect(await request(port, '/linked-dir/secret.txt')).toMatchObject({ status: 403, body: 'Forbidden' })
    if (process.platform !== 'win32') {
      expect(await request(port, '/linked-file.txt')).toMatchObject({ status: 403, body: 'Forbidden' })
    }
  })
})

describe('Web update integrity', () => {
  it.each([
    ['missing SHA-256', undefined],
    ['malformed SHA-256', 'not-a-sha256']
  ])('refuses apply with %s while update check remains available', async (_label, digest) => {
    const parent = await createTempDir()
    const root = path.join(parent, 'web-root')
    const feed = path.join(parent, 'feed')
    await fs.mkdir(root)
    await fs.mkdir(feed)
    await fs.writeFile(path.join(root, 'index.html'), 'old version')
    await fs.writeFile(path.join(root, 'version.json'), '{"version":"1.0.0"}')
    const archive = createZip([
      { path: 'index.html', data: 'new version' },
      { path: 'version.json', data: '{"version":"2.0.0"}' }
    ])
    await fs.writeFile(path.join(feed, 'web.zip'), archive)
    const manifest = { version: '2.0.0', package: { url: 'web.zip' } }
    if (digest !== undefined) manifest.package.sha256 = digest
    await fs.writeFile(path.join(feed, 'version.json'), JSON.stringify(manifest))

    const { port } = await startServer(root, feed)
    expect(await request(port, '/api/update/check')).toMatchObject({ status: 200 })

    const accepted = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/update/apply', method: 'POST' }, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      })
      req.once('error', reject)
      req.end()
    })
    expect(accepted.status).toBe(202)

    let progress
    const deadline = Date.now() + 8000
    do {
      await new Promise((resolve) => setTimeout(resolve, 50))
      progress = await request(port, '/api/update/progress')
    } while (JSON.parse(progress.body).status !== 'error' && Date.now() < deadline)

    expect(JSON.parse(progress.body)).toMatchObject({
      status: 'error',
      error: '更新清单缺少有效 SHA-256，已拒绝应用更新'
    })
    expect(await fs.readFile(path.join(root, 'index.html'), 'utf8')).toBe('old version')
    expect(await fs.readFile(path.join(root, 'version.json'), 'utf8')).toBe('{"version":"1.0.0"}')
  })
})
