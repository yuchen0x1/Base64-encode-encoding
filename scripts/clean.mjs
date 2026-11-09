/**
 * 极客工具箱 · 本地垃圾清理（零依赖）
 *
 * 用法：
 *   npm run clean              清理构建产物与临时目录
 *   npm run clean -- --dry     只列出会删除什么，不动文件
 *   npm run clean -- --all     连 node_modules 与 updates 一起清理
 *
 * 只处理「可再生成」的目录，不触碰任何源码。被占用（例如被编辑器或杀毒软件
 * 打开）的文件不会强行删除，会在结尾列出，关闭占用进程后重跑即可。
 */
import fs from 'node:fs/promises'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 构建产物：每次 build / package 都会重新生成 */
const BUILD_OUTPUT = ['dist', 'dist-win', 'out', 'release', '.tmp-verify', '.tmp-release']
/** 工具缓存：可选删除，删掉只影响下次构建速度 */
const CACHES = ['coverage', '.vite', '.eslintcache', 'node_modules/.vite']
/** 仅在 --all 时清理 */
const HEAVY = ['node_modules', 'updates']

function matchesBuildDir(name) {
  return /^release-build/.test(name)
}

function collectTargets(all) {
  const targets = []
  for (const name of BUILD_OUTPUT) targets.push(name)
  for (const name of readdirSync(ROOT)) {
    if (matchesBuildDir(name)) targets.push(name)
  }
  for (const name of CACHES) targets.push(name)
  if (all) for (const name of HEAVY) targets.push(name)
  return [...new Set(targets)]
}

function directorySize(target) {
  const abs = path.join(ROOT, target)
  if (!existsSync(abs)) return 0
  let stat
  try {
    stat = statSync(abs)
  } catch {
    return 0
  }
  if (!stat.isDirectory()) return stat.size
  let total = 0
  const stack = [abs]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else {
        try {
          total += statSync(full).size
        } catch {
          /* 被占用的文件读不到大小，忽略 */
        }
      }
    }
  }
  return total
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 删除目录并返回仍然删不掉的路径（被别的进程打开） */
async function removeTarget(target) {
  const abs = path.join(ROOT, target)
  try {
    await fs.rm(abs, { recursive: true, force: true })
  } catch {
    /* 整目录删除失败，下面的逐个清理会兜底 */
  }
  if (!existsSync(abs)) return []

  // fs.rm 在 force 模式下可能静默跳过被占用的文件，所以这里复核一遍
  const locked = []
  const walk = async (dir) => {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        try {
          await fs.rmdir(full)
        } catch {
          /* 仍有占用，保留目录 */
        }
        continue
      }
      try {
        await fs.unlink(full)
      } catch {
        // 删除失败基本只有一种原因：文件被别的进程打开（编辑器索引、杀毒软件等）。
        // 环境可能抹掉 error.code，所以这里不按错误码判断，直接记录。
        locked.push(path.relative(ROOT, full))
      }
    }
  }

  await walk(abs)
  try {
    await fs.rmdir(abs)
  } catch {
    /* 目录非空，说明里面还有被占用的文件 */
  }
  return locked
}

const all = process.argv.includes('--all')
const dry = process.argv.includes('--dry')
const targets = collectTargets(all)

const present = targets.filter((name) => existsSync(path.join(ROOT, name)))
if (present.length === 0) {
  console.log('没有需要清理的内容。')
  process.exit(0)
}

let total = 0
const rows = present.map((name) => {
  const size = directorySize(name)
  total += size
  return { name, size }
})
rows.sort((a, b) => b.size - a.size)

if (dry) {
  console.log('以下内容将被删除（--dry 预览，未实际执行）：')
  for (const row of rows) console.log(`  ${row.name.padEnd(26)} ${mb(row.size).padStart(9)}`)
  console.log(`合计 ${mb(total)}`)
  process.exit(0)
}

const lockedAll = []
for (const row of rows) {
  process.stdout.write(`清理 ${row.name.padEnd(26)} ${mb(row.size).padStart(9)} … `)
  const locked = await removeTarget(row.name)
  lockedAll.push(...locked)
  console.log(locked.length ? `${locked.length} 个文件被占用` : '完成')
}

console.log(`\n释放约 ${mb(total)}${lockedAll.length ? `，${lockedAll.length} 个文件仍被占用` : ''}`)
if (lockedAll.length) {
  console.log('被占用的文件（通常是编辑器/杀毒软件仍打开着，关闭后重跑 npm run clean 即可）：')
  for (const file of lockedAll) console.log(`  ${file}`)
  process.exitCode = 1
}
