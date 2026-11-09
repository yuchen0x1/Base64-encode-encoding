/**
 * 独立的更新替换进程（由主进程以 ELECTRON_RUN_AS_NODE=1 拉起）
 *
 * 之所以不用 .bat/.cmd：程序路径含中文时批处理编码极易损坏，
 * 用 Node 执行可以完整支持 UTF-8 路径，并且可跨平台复用。
 *
 * 参数：--pid <主进程 PID> --staging <解压目录> --target <应用目录> --exe <可执行文件> --log <日志文件>
 */
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// 本脚本以 ELECTRON_RUN_AS_NODE 运行，但仍可能带上 Electron 的 asar 文件系统补丁。
// 更新包里包含 resources/app.asar，必须按普通文件覆盖，故全局关闭 asar 特殊处理。
process.noAsar = true

function parseArgs(argv) {
  const args = {}
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key || !key.startsWith('--')) continue
    args[key.slice(2)] = argv[i + 1]
  }
  return args
}

const args = parseArgs(process.argv)

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  process.stdout.write(line)
  if (args.log) {
    try {
      await fs.mkdir(path.dirname(args.log), { recursive: true })
      await fs.appendFile(args.log, line, 'utf8')
    } catch {
      /* 日志失败不阻断更新 */
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

async function waitForExit(pid, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await sleep(300)
  }
  return false
}

async function copyTree(from, to) {
  const items = await fs.readdir(from, { withFileTypes: true })
  await fs.mkdir(to, { recursive: true })
  for (const item of items) {
    const src = path.join(from, item.name)
    const dest = path.join(to, item.name)
    if (item.isDirectory()) {
      await copyTree(src, dest)
    } else if (item.isFile()) {
      if (dest.toLowerCase().endsWith('.asar')) {
        // Electron 的 asar 补丁会拦截直接写 *.asar，改用临时文件 + 改名
        const temp = `${dest}.writing-${process.pid}`
        await fs.copyFile(src, temp)
        await fs.rename(temp, dest)
      } else {
        await fs.copyFile(src, dest)
      }
    }
  }
}

async function copyWithRetry(from, to, attempts = 6) {
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    try {
      await copyTree(from, to)
      return
    } catch (error) {
      lastError = error
      await log(`复制失败（第 ${i + 1} 次）：${error.message}`)
      await sleep(700)
    }
  }
  throw lastError
}

function launch(exe, extraArgs = []) {
  if (!exe || !existsSync(exe)) return null
  const child = spawn(exe, extraArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    cwd: path.dirname(exe)
  })
  child.unref()
  return child
}

async function main() {
  const pid = Number(args.pid)
  const staging = args.staging
  const target = args.target
  const exe = args.exe

  await log(`更新进程启动 pid=${pid} staging=${staging} target=${target}`)

  if (!staging || !target) {
    await log('参数缺失，终止更新')
    return 1
  }
  if (!existsSync(staging)) {
    await log('暂存目录不存在，终止更新')
    launch(exe)
    return 1
  }

  const exited = await waitForExit(pid)
  if (!exited) {
    await log('等待主进程退出超时，放弃替换以免文件占用')
    return 1
  }
  await sleep(600)

  try {
    await copyWithRetry(staging, target)
    await log('文件替换完成，正在启动新版本')
    launch(exe, [`--updated=${Date.now()}`])
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    await log('更新成功')
    return 0
  } catch (error) {
    await log(`更新失败：${error.message}，尝试回滚启动旧版本`)
    launch(exe)
    return 1
  }
}

async function cleanup() {
  if (!args.cleanup) return
  try {
    await fs.rm(args.cleanup, { force: true })
  } catch {
    /* 临时脚本清理失败不影响结果 */
  }
}

main()
  .then(async (code) => {
    await cleanup()
    process.exit(code)
  })
  .catch(async (error) => {
    await log(`未捕获异常：${error.stack || error.message}`)
    await cleanup()
    process.exit(1)
  })
