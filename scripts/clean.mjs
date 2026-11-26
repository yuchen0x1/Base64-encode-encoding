/**
 * 本地构建产物清理：--dry 仅预览；--all 额外清理 node_modules 和 updates。
 * 只删除工作区内的已知产物，不沿符号链接递归，也不隐藏删除失败。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD_OUTPUT = ['dist', 'dist-cli', 'dist-win', 'out', 'release', 'release-candidate', '.tmp-verify', '.tmp-release', 'install.log']
const CACHES = ['coverage', '.vite', '.eslintcache', 'node_modules/.vite']
const HEAVY = ['node_modules', 'updates']

export function matchesBuildDir(name) {
  return name === 'release-build' || name.startsWith('release-build-')
}

function isWithin(root, absolute) {
  const relative = path.relative(root, absolute)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export async function createCleaner(root = ROOT, fileSystem = fs) {
  root = path.resolve(root)
  const realRoot = await fileSystem.realpath(root)

  async function statOrMissing(absolute) {
    try {
      return await fileSystem.lstat(absolute)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
      throw error
    }
  }

  async function inspect(target) {
    if (typeof target !== 'string' || !target || path.isAbsolute(target)) throw new Error('清理目标必须是工作区内的相对路径')
    const absolute = path.resolve(root, target)
    if (!isWithin(root, absolute)) throw new Error('拒绝清理工作区之外的路径或工作区本身')
    const parts = path.relative(root, absolute).split(path.sep)
    let current = root
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index])
      const stat = await statOrMissing(current)
      if (!stat) return { absolute, stat: null }
      if (stat.isSymbolicLink()) {
        if (index < parts.length - 1) throw new Error('拒绝沿父目录符号链接清理')
        return { absolute, stat }
      }
      if (!isWithin(realRoot, await fileSystem.realpath(current))) throw new Error('拒绝清理实际路径位于工作区外的文件')
      if (index === parts.length - 1) return { absolute, stat }
    }
  }

  async function collectTargets(all = false) {
    const entries = await fileSystem.readdir(root, { withFileTypes: true })
    const targets = [...BUILD_OUTPUT, ...entries.filter((entry) => entry.isDirectory() && matchesBuildDir(entry.name)).map((entry) => entry.name), ...CACHES, ...(all ? HEAVY : [])]
    return [...new Set(targets)].filter((target) => !targets.some((parent) => parent !== target && target.startsWith(`${parent}/`)))
  }

  async function directorySize(target) {
    const { absolute, stat } = await inspect(target)
    if (!stat || stat.isSymbolicLink()) return 0
    if (!stat.isDirectory()) return stat.size
    let total = 0
    for (const entry of await fileSystem.readdir(absolute)) total += await directorySize(path.join(target, entry))
    return total
  }

  async function removeTarget(target) {
    const failed = new Set()
    let removedBytes = 0
    async function remove(relative) {
      try {
        const { absolute, stat } = await inspect(relative)
        if (!stat) return
        if (stat.isDirectory() && !stat.isSymbolicLink()) {
          for (const entry of await fileSystem.readdir(absolute)) await remove(path.join(relative, entry))
          await fileSystem.rmdir(absolute)
        } else {
          await fileSystem.unlink(absolute)
          if (!stat.isSymbolicLink()) removedBytes += stat.size
        }
      } catch {
        failed.add(relative)
      }
    }
    await remove(target)
    return { failed: [...failed], removedBytes }
  }

  return { inspect, collectTargets, directorySize, removeTarget }
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function clean({ root = ROOT, argv = process.argv.slice(2), fileSystem = fs, io = console } = {}) {
  const cleaner = await createCleaner(root, fileSystem)
  const rows = []
  const failures = new Set()
  for (const name of await cleaner.collectTargets(argv.includes('--all'))) {
    try {
      if ((await cleaner.inspect(name)).stat) rows.push({ name, size: await cleaner.directorySize(name) })
    } catch {
      failures.add(name)
    }
  }
  rows.sort((a, b) => b.size - a.size)

  if (argv.includes('--dry')) {
    io.log('以下内容将被删除（--dry 预览，未实际执行）：')
    for (const row of rows) io.log(`  ${row.name.padEnd(26)} ${mb(row.size).padStart(9)}`)
    io.log(`合计 ${mb(rows.reduce((sum, row) => sum + row.size, 0))}`)
  } else {
    let removedBytes = 0
    for (const row of rows) {
      const result = await cleaner.removeTarget(row.name)
      removedBytes += result.removedBytes
      for (const name of result.failed) failures.add(name)
      io.log(`清理 ${row.name.padEnd(26)} ${result.failed.length ? '未完成，已保留失败路径' : '完成'}`)
    }
    io.log(rows.length ? `释放约 ${mb(removedBytes)}` : '没有需要清理的内容。')
  }
  if (failures.size) {
    io.log('以下路径未能安全读取或删除，已保留；请检查权限、文件占用或符号链接：')
    for (const name of failures) io.log(`  ${name}`)
  }
  return failures.size ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  clean().then((code) => { process.exitCode = code }).catch((error) => {
    console.error(`清理失败：${error.message}`)
    process.exitCode = 1
  })
}
