/**
 * 更新安装助手
 *
 * 由更新器以 detached 方式拉起（ELECTRON_RUN_AS_NODE=1，走打包后的 Electron 二进制当 Node 用），
 * 主进程随即退出。职责只有四步：
 *   1. 等主进程真正退出（否则安装器无法覆盖被占用的 app.asar）
 *   2. 静默运行 NSIS 安装包（/S）
 *   3. 确认安装后的可执行文件存在
 *   4. 拉起新版本
 *
 * 这个文件运行时会被复制到 userData/updates/ 下执行，不能依赖 app.asar 内的任何资源。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

function parseArgs(argv) {
  const result = {}
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]
    if (!key || !key.startsWith('--')) continue
    result[key.slice(2)] = argv[i + 1]
  }
  return result
}

const args = parseArgs(process.argv)
const logFile = args.log

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    fs.appendFileSync(logFile, line, 'utf8')
  } catch {
    /* 日志写入失败不影响安装流程 */
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForExit(pid, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await sleep(300)
  }
  return !isAlive(pid)
}

/**
 * 静默安装。
 * /D 指定安装目录时必须保持“不带引号且位于最后”——NSIS 会把 /D= 之后的整行当作路径，
 * 一旦被 Node 加上引号，路径里就会多出两个字面引号。因此只有路径不含空格时才传 /D，
 * 其余情况交给安装器自己按卸载注册表 / 默认目录决定（升级场景通常已经是同一目录）。
 */
function runInstaller(installer, target) {
  const args = ['/S']
  const useDir = target && !/[\s"]/.test(target)
  const spawnOptions = { stdio: 'ignore', windowsHide: true }
  if (useDir) {
    args.push(`/D=${target}`)
    // 关闭参数转义，避免 /D= 被引号包裹
    spawnOptions.windowsVerbatimArguments = true
  }
  return new Promise((resolve, reject) => {
    const child = spawn(installer, args, spawnOptions)
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 0))
  })
}

async function main() {
  const pid = Number(args.pid)
  const installer = args.installer
  const exe = args.exe
  const product = args.product || '极客工具箱'

  log(`安装助手启动：pid=${pid} installer=${installer} product=${product}`)

  if (!installer || !fs.existsSync(installer)) {
    log('安装包不存在，放弃安装')
    return
  }

  const exited = await waitForExit(pid)
  if (!exited) {
    log('主进程未在超时时间内退出，放弃安装（应用仍在运行）')
    return
  }
  log('主进程已退出，等待文件句柄释放')
  await sleep(800)

  log('开始静默安装')
  const code = await runInstaller(installer, args.target)
  log(`安装器退出码：${code}`)
  await sleep(600)

  const candidates = [
    exe,
    path.join(args.target || '', path.basename(exe || '')),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', product, path.basename(exe || '')) : ''
  ].filter(Boolean)

  const installed = candidates.find((candidate) => fs.existsSync(candidate))
  if (!installed) {
    log(`安装后未找到可执行文件，候选路径：${candidates.join(' | ')}`)
    return
  }

  log(`拉起新版本：${installed}`)
  spawn(installed, [], { detached: true, stdio: 'ignore' }).unref()
}

main()
  .catch((error) => log(`安装失败：${error.message}`))
  .finally(async () => {
    await sleep(300)
    if (args.cleanup) {
      try {
        fs.unlinkSync(args.cleanup)
      } catch {
        /* 自身文件删除失败可忽略，下次更新会覆盖 */
      }
    }
  })
