/**
 * 更新安装助手
 *
 * 由更新器以 detached 方式拉起（ELECTRON_RUN_AS_NODE=1，走打包后的 Electron 二进制当 Node 用），
 * 主进程随即退出。职责：
 *   1. 等主进程真正退出，并等旧文件句柄释放（否则安装器无法覆盖被占用的 exe / app.asar）
 *   2. 静默运行 NSIS 安装包（/S）
 *   3. 校验「安装是否完整」——主程序 + app.asar 必须包含预期版本
 *   4. 不完整则自动重试；重试仍失败则退回交互式安装向导，绝不把用户丢在一个没有主程序的目录里
 *   5. 成功后拉起新版本
 *
 * 这个文件运行时会被复制到 userData/updates/ 下执行，不能依赖 app.asar 内的任何资源。
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { verifyPayload } from './installer-verification.js'

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

function log(message, file = logFile) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    fs.appendFileSync(file, line, 'utf8')
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

/** 文件是否仍被占用：Windows 下被进程独占打开的文件无法用 r+ 打开 */
function isFileLocked(file) {
  if (!fs.existsSync(file)) return false
  try {
    const fd = fs.openSync(file, 'r+')
    fs.closeSync(fd)
    return false
  } catch (error) {
    // 只读属性 / 权限问题同样会打开失败，但不代表被占用
    return error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES'
  }
}

/**
 * 等待旧文件句柄释放。
 * Electron 的子进程（GPU / 渲染 / 工具进程）与主进程共用同一个 exe，
 * 主进程退出后它们可能还活着一小会儿；此时安装器会静默跳过被占用的文件。
 */
async function waitForUnlock(files, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let waited = 0
  while (Date.now() < deadline) {
    const locked = files.filter((file) => isFileLocked(file))
    if (!locked.length) {
      if (waited > 0) log(`文件句柄已释放（等待 ${waited}ms）`)
      return true
    }
    if (waited === 0) log(`检测到文件仍被占用，等待释放：${locked.join(' | ')}`)
    await sleep(400)
    waited += 400
  }
  log(`等待文件释放超时，继续尝试安装：${files.filter((f) => isFileLocked(f)).join(' | ')}`)
  return false
}

/**
 * 静默安装。
 * /D 指定安装目录时必须保持“不带引号且位于最后”——NSIS 会把 /D= 之后的整行当作路径，
 * 一旦被 Node 加上引号，路径里就会多出两个字面引号。因此只有路径不含空格时才传 /D，
 * 其余情况交给安装器自己按卸载注册表 / 默认目录决定（升级场景通常已经是同一目录）。
 */
function runInstaller(installer, targetPath, { silent = true } = {}) {
  // NSIS 只认反斜杠路径：正斜杠会被当成命令行开关吃掉，导致装到 "C:Userslenmo..." 这种畸形路径。
  const target = targetPath ? targetPath.replace(/\//g, '\\') : ''
  const installerArgs = silent ? ['/S'] : []
  const useDir = target && !/[\s"]/.test(target)
  const spawnOptions = { stdio: 'ignore', windowsHide: silent }
  if (useDir) {
    installerArgs.push(`/D=${target}`)
    // 关闭参数转义，避免 /D= 被引号包住
    spawnOptions.windowsVerbatimArguments = true
  }
  return new Promise((resolve, reject) => {
    const child = spawn(installer, installerArgs, spawnOptions)
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 0))
  })
}

function verifyInstalledPayload(dir, exeName, expectedVersion) {
  const result = verifyPayload(dir, exeName, expectedVersion)
  if (result.asarSize >= 0 && result.asarSize < 1024 * 100) {
    result.problems = result.problems.filter((problem) => !problem.startsWith('resources/app.asar='))
  }
  return result
}

function writeFailureMarker(workDir, details) {
  try {
    const file = path.join(workDir, 'install-failed.txt')
    fs.writeFileSync(file, `[${new Date().toISOString()}] 更新安装不完整\n${details}\n`, 'utf8')
  } catch {
    /* 写标记失败不影响后续兜底 */
  }
}

function cleanupFile(file) {
  if (!file) return
  try {
    fs.unlinkSync(file)
    return
  } catch {
    /* 当前进程可能仍持有运行时副本，交给独立 cmd 进程稍后清理 */
  }

  if (process.platform !== 'win32') return
  const command = process.env.ComSpec || process.env.COMSPEC || 'cmd.exe'
  const escaped = String(file).replace(/"/g, '""')
  const script = `ping.exe 127.0.0.1 -n 2 >nul & del /f /q "${escaped}"`
  try {
    const child = spawn(command, ['/d', '/s', '/c', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
  } catch {
    /* 延迟清理失败不影响已完成的安装流程 */
  }
}

/**
 * 安装助手状态机。即使旧 exe 和 app.asar 文件存在，只有 archive 中的
 * package.json.version 与本次更新目标完全相同才视为成功。
 * Dependencies can be injected so tests do not launch NSIS or wait on real timers.
 */
export async function runInstallerAssistant(options, dependencies = {}) {
  const {
    waitForExitImpl = waitForExit,
    waitForUnlockImpl = waitForUnlock,
    runInstallerImpl = runInstaller,
    sleepImpl = sleep,
    spawnImpl = spawn
  } = dependencies
  const pid = Number(options.pid)
  const installer = options.installer
  const exe = options.exe
  const product = options.product || '极客工具箱'
  const exeName = path.basename(exe || '') || `${product}.exe`
  const installDir = options.target || (exe ? path.dirname(exe) : '')
  const expectedVersion = options.version
  const logPath = options.log || path.join(process.cwd(), 'install.log')
  const workDir = path.dirname(logPath)
  const writeLog = (message) => log(message, logPath)

  writeLog(`安装助手启动：pid=${pid} installer=${installer} product=${product} version=${expectedVersion} 目录=${installDir}`)

  if (!expectedVersion) {
    writeLog('更新目标版本缺失，放弃安装')
    return { ok: false, reason: 'missing-version' }
  }
  if (!installer || !fs.existsSync(installer)) {
    writeLog('安装包不存在，放弃安装')
    return { ok: false, reason: 'missing-installer' }
  }

  const exited = await waitForExitImpl(pid)
  if (!exited) {
    writeLog('主进程未在超时时间内退出，放弃安装（应用仍在运行）')
    return { ok: false, reason: 'process-running' }
  }
  writeLog('主进程已退出，等待文件句柄释放')
  await sleepImpl(800)
  await waitForUnlockImpl([
    path.join(installDir, exeName),
    path.join(installDir, 'resources', 'app.asar')
  ])

  let verified = null
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    writeLog(`开始静默安装（第 ${attempt}/${maxAttempts} 次）`)
    const code = await runInstallerImpl(installer, installDir)
    writeLog(`安装器退出码：${code}`)
    // 解压落盘与 Uninstall 注册比进程退出稍晚，给一点缓冲再校验
    await sleepImpl(1200)

    const check = installDir
      ? verifyInstalledPayload(installDir, exeName, expectedVersion)
      : { ok: false, problems: ['未知安装目录'] }
    if (check.ok) {
      verified = check
      writeLog(`安装完整性校验通过：版本=${check.installedVersion} ${exeName}=${check.exeSize}B app.asar=${check.asarSize}B`)
      break
    }

    writeLog(`第 ${attempt} 次安装后校验失败：${check.problems.join('，')}`)
    if (attempt < maxAttempts) {
      writeLog('等待 2 秒后重试（用于清理残留句柄 / 补齐上次被跳过的文件）')
      await waitForUnlockImpl([
        path.join(installDir, exeName),
        path.join(installDir, 'resources', 'app.asar')
      ], 8000)
      await sleepImpl(2000)
    }
  }

  if (!verified) {
    const detail = installDir
      ? verifyInstalledPayload(installDir, exeName, expectedVersion).problems.join('，')
      : '未知安装目录'
    writeLog(`连续 ${maxAttempts} 次静默安装均不完整（${detail}），转入交互式安装向导`)
    writeFailureMarker(workDir, `目录：${installDir}\n缺失：${detail}`)
    // 兜底：不再静默，交给用户点「下一步」，至少能装出一个可用的应用
    try {
      await runInstallerImpl(installer, installDir, { silent: false })
      writeLog('交互式安装器已启动（安装包保留在缓存目录，供用户重试）')
    } catch (error) {
      writeLog(`交互式安装启动失败：${error.message}`)
    }
    return { ok: false, reason: 'payload-verification-failed' }
  }

  const installed = verified.exePath
  writeLog(`拉起新版本：${installed}`)
  // 关键：安装助手自身是带 ELECTRON_RUN_AS_NODE=1 启动的，
  // 若把该变量透传给新进程，应用会被当成 Node 解释器运行并立刻退出（报 bad option）。
  const launchEnv = { ...process.env }
  delete launchEnv.ELECTRON_RUN_AS_NODE
  spawnImpl(installed, [], { detached: true, stdio: 'ignore', env: launchEnv }).unref()

  // 安装包已生效，删掉下载缓存，避免每升一次版本就在 userData 里留一份 100+ MB 的 exe
  try {
    fs.unlinkSync(installer)
    writeLog('已清理下载缓存中的安装包')
  } catch {
    /* 文件被占用时忽略，下次更新会覆盖 */
  }

  return { ok: true, version: verified.installedVersion }
}

async function main() {
  const result = await runInstallerAssistant(args)
  if (result.ok === false) log(`安装流程未完成：${result.reason}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
    .catch((error) => log(`安装失败：${error.message}`))
    .finally(async () => {
      await sleep(300)
      if (args.cleanup) {
        cleanupFile(args.cleanup)
      }
      if (args['cleanup-helper']) {
        cleanupFile(args['cleanup-helper'])
      }
      if (args['cleanup-runtime']) {
        cleanupFile(args['cleanup-runtime'])
      }
    })
}
