import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

async function copyFileWithRetry(from, to, attempts = 4) {
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.copyFile(from, to)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw lastError
}

async function removeDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true })
    return true
  } catch {
    /* 回退逐文件删除 */
  }

  async function walk(current) {
    let stat
    try {
      stat = await fs.lstat(current)
    } catch (error) {
      return error.code === 'ENOENT'
    }

    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      await fs.unlink(current).catch(() => {})
    } else {
      let items
      try {
        items = await fs.readdir(current)
      } catch {
        return false
      }
      for (const name of items) {
        if (!await walk(path.join(current, name))) return false
      }
      await fs.rmdir(current).catch(() => {})
    }

    try {
      await fs.lstat(current)
      return false
    } catch (error) {
      return error.code === 'ENOENT'
    }
  }

  return walk(dir)
}

async function pathStatOrNull(file) {
  try {
    return await fs.lstat(file)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
    throw error
  }
}

async function removeEntry(file) {
  const stat = await pathStatOrNull(file)
  if (!stat) return
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    if (!await removeDir(file)) throw new Error(`无法删除旧目录: ${file}`)
  } else {
    await fs.unlink(file)
  }
}

async function copyDirectoryContents(source, target) {
  await fs.mkdir(target, { recursive: true })
  const items = await fs.readdir(source)
  for (const name of items) {
    const from = path.join(source, name)
    const to = path.join(target, name)
    const stat = await fs.lstat(from)
    if (stat.isSymbolicLink()) {
      await removeEntry(to)
      await fs.symlink(await fs.readlink(from), to)
    } else if (stat.isDirectory()) {
      const targetStat = await pathStatOrNull(to)
      if (targetStat && (!targetStat.isDirectory() || targetStat.isSymbolicLink())) await removeEntry(to)
      await copyDirectoryContents(from, to)
    } else if (stat.isFile()) {
      const targetStat = await pathStatOrNull(to)
      if (targetStat && (targetStat.isDirectory() || targetStat.isSymbolicLink())) await removeEntry(to)
      await copyFileWithRetry(from, to)
    } else {
      throw new Error(`不支持复制特殊文件: ${from}`)
    }
  }
}

async function syncDirectoryContents(source, target) {
  await fs.mkdir(target, { recursive: true })
  const sourceItems = (await fs.readdir(source)).sort()
  const sourceNames = new Set(sourceItems)
  const targetItems = await fs.readdir(target)

  for (const name of targetItems) {
    if (!sourceNames.has(name)) await removeEntry(path.join(target, name))
  }

  for (const name of sourceItems) {
    const from = path.join(source, name)
    const to = path.join(target, name)
    const stat = await fs.lstat(from)
    const targetStat = await pathStatOrNull(to)

    if (stat.isSymbolicLink()) {
      await removeEntry(to)
      await fs.symlink(await fs.readlink(from), to)
    } else if (stat.isDirectory()) {
      if (targetStat && (!targetStat.isDirectory() || targetStat.isSymbolicLink())) await removeEntry(to)
      await syncDirectoryContents(from, to)
    } else if (stat.isFile()) {
      if (targetStat && (targetStat.isDirectory() || targetStat.isSymbolicLink())) await removeEntry(to)
      await copyFileWithRetry(from, to)
    } else {
      throw new Error(`不支持复制特殊文件: ${from}`)
    }
  }
}

/**
 * Windows 下目录可能被杀毒/索引服务短暂占用，导致整目录 rename 失败（EPERM）。
 * 逐文件替换时先创建完整快照；任一文件失败后清空部分新版本并恢复完整旧目录。
 */
export async function replaceInPlace(staging, root, onWarning = () => {}) {
  const rootPath = path.resolve(root)
  const stagingPath = path.resolve(staging)
  const backup = `${rootPath}.rollback-${process.pid}-${crypto.randomUUID()}`
  await fs.mkdir(rootPath, { recursive: true })

  try {
    try {
      await copyDirectoryContents(rootPath, backup)
    } catch (error) {
      await removeDir(backup)
      throw new Error(`无法创建旧版本回滚副本：${error.message}`, { cause: error })
    }

    try {
      await syncDirectoryContents(stagingPath, rootPath)
    } catch (error) {
      try {
        const items = await fs.readdir(rootPath)
        for (const name of items) await removeEntry(path.join(rootPath, name))
        await copyDirectoryContents(backup, rootPath)
      } catch (rollbackError) {
        const failure = new AggregateError([error, rollbackError], `逐文件覆盖失败且无法恢复旧版本；旧版本回滚副本保留在 ${backup}`, { cause: rollbackError })
        throw failure
      }

      if (!await removeDir(backup)) onWarning(`无法清理回滚副本 ${backup}`)
      throw new Error(`逐文件覆盖失败，已恢复完整旧版本：${error.message}`, { cause: error })
    }

    if (!await removeDir(backup)) onWarning(`逐文件覆盖成功，但无法清理回滚副本 ${backup}`)
  } finally {
    if (!await removeDir(staging)) onWarning(`无法清理暂存目录 ${stagingPath}`)
  }
}
