/**
 * 桌面端更新器（Electron 主进程）
 *
 * 流程：读取更新源 version.json → 版本比较 → 下载 NSIS 安装包（带进度）
 *      → SHA-256 校验 → 启动独立安装助手 → 主进程退出 → 静默覆盖安装 → 拉起新版本
 *
 * 设计取舍：只发布一个 Windows 安装包（GeekToolbox-Setup-<version>.exe），
 * 不再产出便携版与 ZIP 更新包。安装包本身就是更新载体，安装器会读取卸载注册表
 * 中的 InstallLocation 原位覆盖，用户自定义的安装目录也不会被重置。
 *
 * 更新源优先级：
 *   1. 环境变量 TOOLBOX_UPDATE_FEED（目录或 version.json 的 http(s) 地址）
 *   2. 程序目录下的 update-config.json 的 feed 字段
 *   3. 打包版默认使用 GitHub Releases latest/download/version.json
 *      开发环境使用项目根 updates/desktop 目录
 */
import { app, net, BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isNewerVersion, normalizeVersion } from '../shared/version.js'
import { assertSupportedInstallerPackage, normalizeSignatureMetadata } from './update-validation.js'
import { prepareInstallerRuntime, startInstallerHelper } from './installer-bootstrap.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_UPDATE_FEED = 'https://github.com/yuchen0x1/Base64-encode-encoding/releases/latest/download/version.json'

const state = {
  latest: null,
  manifestBase: '',
  manifestKind: '',
  packageInfo: null,
  installerFile: '',
  downloading: false,
  installing: false,
  signature: null
}

function getWindow() {
  return BrowserWindow.getAllWindows()[0] || null
}

function sendEvent(payload) {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send('update:event', payload)
    })
    return
  }
  win.webContents.send('update:event', payload)
}

function sendProgress(percent, message) {
  sendEvent({ type: 'progress', percent: Math.max(0, Math.min(100, Math.round(percent))), message })
}

function isPortableRuntime() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR)
}

function appDir() {
  return process.env.TOOLBOX_APP_DIR || (app.isPackaged && !isPortableRuntime() ? path.dirname(app.getPath('exe')) : '')
}

export function getRuntimeCopyPath(workDir, pid = process.pid, timestamp = Date.now()) {
  return path.join(workDir, `toolbox-updater-runtime-${timestamp}-${pid}`, 'runtime.exe')
}

export function resolveFeed() {
  if (process.env.TOOLBOX_UPDATE_FEED) return process.env.TOOLBOX_UPDATE_FEED

  const configPath = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'update-config.json')
    : path.join(__dirname, '..', 'update-config.json')

  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'))
      if (config.feed) return config.feed
    } catch {
      /* 配置损坏时回退默认更新源 */
    }
  }

  if (app.isPackaged) return DEFAULT_UPDATE_FEED
  return path.join(__dirname, '..', 'updates', 'desktop')
}

async function httpFetch(url, options) {
  if (net && typeof net.fetch === 'function') return net.fetch(url, options)
  return fetch(url, options)
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

async function readManifest(feed) {
  if (isHttpUrl(feed)) {
    const manifestUrl = new URL(feed)
    if (!/\.json$/i.test(manifestUrl.pathname)) {
      if (!manifestUrl.pathname.endsWith('/')) manifestUrl.pathname += '/'
      manifestUrl.pathname += 'version.json'
    }
    const res = await httpFetch(manifestUrl.href, { cache: 'no-store' })
    if (!res.ok) throw new Error(`更新源返回 HTTP ${res.status}`)
    return { manifest: await res.json(), base: new URL('.', manifestUrl).href }
  }
  const isManifestFile = path.extname(feed).toLowerCase() === '.json'
  const base = isManifestFile ? path.dirname(feed) : feed
  const file = isManifestFile ? feed : path.join(feed, 'version.json')
  if (!existsSync(file)) {
    throw new Error(`未找到更新源清单：${file}`)
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  return { manifest, base }
}

export function resolvePackage(manifest, base) {
  const info = manifest.package || {}
  const url = Object.hasOwn(info, 'url')
    ? info.url
    : `GeekToolbox-Setup-${manifest.version}.exe`
  if (isHttpUrl(url)) return { ...info, url: new URL(url).href, kind: 'http' }

  // Reject unsupported URL schemes instead of turning them into local file paths.
  if (typeof url === 'string' && /^[a-z][a-z\d+.-]*:/i.test(url) && !/^[a-z]:[\\/]/i.test(url)) {
    return { ...info, url, kind: 'invalid' }
  }

  // Resolve relative package URLs using URL semantics, not filesystem path rules.
  if (isHttpUrl(base)) {
    try {
      return { ...info, url: new URL(url, base).href, kind: 'http' }
    } catch {
      // Keep malformed values for strict package validation to reject.
      return { ...info, url, kind: 'http' }
    }
  }

  if (typeof url !== 'string') return { ...info, url, kind: 'file' }
  return { ...info, url: path.isAbsolute(url) ? url : path.join(base, url), kind: 'file' }
}

async function writeAll(handle, buffer, position) {
  let offset = 0
  while (offset < buffer.byteLength) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.byteLength - offset, position + offset)
    if (!bytesWritten) throw new Error('写入更新包失败：未能完整写入内容')
    offset += bytesWritten
  }
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256')
  const handle = await fs.open(file, 'r')
  try {
    const buffer = Buffer.alloc(512 * 1024)
    let position = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
      position += bytesRead
    }
  } finally {
    await handle.close()
  }
  return hash.digest('hex')
}

async function downloadHttpTo(url, dest, expectedSize, onProgress, attempts = 3) {
  const declaredSize = Number(expectedSize)
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let start = 0
    try {
      const existing = await fs.stat(dest).catch(() => null)
      if (existing?.isFile() && existing.size > 0 && (!declaredSize || existing.size < declaredSize)) {
        start = existing.size
      }

      const headers = start ? { Range: `bytes=${start}-` } : undefined
      const res = await httpFetch(url, { cache: 'no-store', headers })
      if (!res?.ok) throw new Error(`下载更新包失败：HTTP ${res?.status ?? '未知状态'}`)
      if (!res.body || typeof res.body.getReader !== 'function') {
        throw new Error('下载更新包失败：HTTP 响应缺少内容流')
      }

      const resumed = start > 0 && res.status === 206
      if (start > 0 && !resumed) {
        start = 0
        await fs.truncate(dest, 0)
      }

      const contentLength = Number(res.headers?.get?.('content-length'))
      const contentRange = res.headers?.get?.('content-range') || ''
      const rangeTotal = Number(contentRange.match(/\/([0-9]+)$/)?.[1] || 0)
      const total = rangeTotal || (Number.isFinite(declaredSize) && declaredSize > 0
        ? declaredSize
        : Number.isFinite(contentLength) && contentLength > 0
          ? start + contentLength
          : 0)
      const handle = await fs.open(dest, start ? 'r+' : 'w')
      const reader = res.body.getReader()
      let received = start
      let lastReport = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!(value instanceof Uint8Array)) throw new Error('下载更新包失败：内容流返回了无效数据')
          await writeAll(handle, value, received)
          received += value.byteLength
          const now = Date.now()
          if (now - lastReport > 120) {
            lastReport = now
            onProgress(total ? received / total : 0)
          }
        }
      } finally {
        reader.releaseLock()
        await handle.close()
      }

      if (received === 0) throw new Error('下载更新包失败：响应内容为空')
      if (declaredSize > 0 && received !== declaredSize) {
        throw new Error(`下载更新包大小不匹配（期望 ${declaredSize} 字节，实际 ${received} 字节）`)
      }
      onProgress(1)
      return received
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 700))
      }
    }
  }

  throw new Error(`下载更新包失败（已重试 ${attempts} 次）：${lastError?.message || '未知错误'}`, { cause: lastError })
}

async function downloadTo(url, dest, expectedSize, onProgress) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  if (isHttpUrl(url)) return downloadHttpTo(url, dest, expectedSize, onProgress)

  const handle = await fs.open(dest, 'w')
  try {
    const stat = await fs.stat(url)
    const total = stat.size || 1
    const buffer = Buffer.alloc(256 * 1024)
    const source = await fs.open(url, 'r')
    let received = 0
    try {
      for (;;) {
        const { bytesRead } = await source.read(buffer, 0, buffer.length, received)
        if (!bytesRead) break
        await writeAll(handle, buffer.subarray(0, bytesRead), received)
        received += bytesRead
        onProgress(received / total)
      }
    } finally {
      await source.close()
    }
    if (received === 0) throw new Error('下载更新包失败：安装包内容为空')
    return received
  } finally {
    await handle.close()
  }
}

export async function verifyAuthenticodeSignature(file, signature) {
  const expected = normalizeSignatureMetadata(signature)
  if (!expected) return { status: 'missing', signed: false }
  if (process.platform !== 'win32') throw new Error('无法验证 Authenticode：当前平台不是 Windows')

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$file = $env:TOOLBOX_SIGNATURE_TARGET",
    "if ([string]::IsNullOrWhiteSpace($file)) { throw '签名校验目标路径为空' }",
    "$sig = Get-AuthenticodeSignature -LiteralPath $file",
    "if ($sig.Status -ne 'Valid') { Write-Error ('状态=' + $sig.Status); exit 2 }",
    "$thumb = ($sig.SignerCertificate.Thumbprint -replace '\\s', '').ToUpperInvariant()",
    "Write-Output ($sig.Status.ToString() + '|' + $thumb)"
  ].join('; ')

  const output = await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TOOLBOX_SIGNATURE_TARGET: file }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr.trim() || `签名验证退出码 ${code}`)))
  })

  const [status, thumbprint] = String(output).split('|')
  if (status !== 'Valid' || thumbprint.toUpperCase() !== expected.thumbprint) {
    throw new Error(`安装包数字签名校验失败（期望 ${expected.thumbprint}，实际 ${thumbprint || '未知'}）`)
  }
  return { status: 'valid', signed: true, thumbprint: thumbprint.toUpperCase() }
}

export async function checkForUpdates() {
  const currentVersion = normalizeVersion(app.getVersion())
  state.latest = null
  state.packageInfo = null
  state.manifestKind = ''
  state.installerFile = ''
  state.signature = null

  if (process.platform !== 'win32') {
    return {
      supported: false,
      reason: 'Electron 自动更新仅支持 Windows NSIS 安装包',
      hasUpdate: false,
      currentVersion,
      latest: null,
      mode: 'electron',
      packaged: app.isPackaged,
      appDir: appDir() || null,
      portable: isPortableRuntime()
    }
  }

  const feed = resolveFeed()

  let manifest
  let base
  try {
    const result = await readManifest(feed)
    manifest = result.manifest
    base = result.base
  } catch (error) {
    throw new Error(`${error.message}（更新源：${feed}）`, { cause: error })
  }

  if (!manifest || !manifest.version) throw new Error('更新清单缺少 version 字段')

  const latestVersion = normalizeVersion(manifest.version)
  if (!latestVersion) throw new Error('更新清单 version 字段无效')
  const pkg = resolvePackage(manifest, base)
  const kind = manifest.kind || ''
  const hasUpdate = isNewerVersion(latestVersion, currentVersion)
  if (hasUpdate) assertSupportedInstallerPackage(pkg, kind)

  state.manifestBase = base
  state.packageInfo = pkg
  state.manifestKind = kind

  if (hasUpdate) {
    state.latest = {
      version: latestVersion,
      buildTime: manifest.buildTime || null,
      notes: Array.isArray(manifest.notes) ? manifest.notes : [],
      releaseDate: manifest.releaseDate || null,
      size: pkg.size || null,
      force: Boolean(manifest.force),
      signed: Boolean(pkg.signature)
    }
  } else {
    state.latest = null
  }

  return {
    supported: true,
    hasUpdate,
    currentVersion,
    latest: state.latest,
    mode: 'electron',
    packaged: app.isPackaged,
    appDir: appDir() || null,
    portable: isPortableRuntime()
  }
}

function installerFileName(pkg, version) {
  try {
    const raw = /^https?:/i.test(pkg.url) ? new URL(pkg.url).pathname : pkg.url
    const base = path.basename(decodeURIComponent(raw))
    if (/\.exe$/i.test(base)) return base
  } catch {
    /* 名称不可解析时使用默认命名 */
  }
  return `GeekToolbox-Setup-${version}.exe`
}

export async function downloadUpdate() {
  if (process.platform !== 'win32') throw new Error('Electron 自动更新仅支持 Windows NSIS 安装包')
  if (!state.latest) throw new Error('没有可用的更新')
  if (state.downloading) throw new Error('更新包正在下载中')

  const pkg = state.packageInfo
  if (!pkg) throw new Error('更新包信息缺失，请重新检查更新')
  assertSupportedInstallerPackage(pkg, state.manifestKind)

  state.downloading = true
  let dest = ''
  try {
    const baseDir = path.join(app.getPath('userData'), 'updates')
    dest = path.join(baseDir, installerFileName(pkg, state.latest.version))
    await fs.mkdir(baseDir, { recursive: true })
    await fs.rm(dest, { force: true })

    sendProgress(1, '正在下载安装包…')
    const received = await downloadTo(pkg.url, dest, pkg.size, (ratio) => {
      sendProgress(2 + ratio * 86, `正在下载安装包… ${Math.round(ratio * 100)}%`)
    })

    sendProgress(90, '正在校验安装包…')
    const actual = await hashFile(dest)
    if (actual.toLowerCase() !== pkg.sha256.toLowerCase()) {
      throw new Error(`安装包校验失败（期望 ${pkg.sha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
    }

    state.signature = await verifyAuthenticodeSignature(dest, pkg.signature)

    state.installerFile = dest
    sendProgress(96, state.signature.signed ? 'SHA-256 与数字签名校验通过' : 'SHA-256 校验通过（清单未提供数字签名）')
    return { ok: true, size: received, installer: dest, signature: state.signature }
  } catch (error) {
    state.installerFile = ''
    if (dest) {
      await fs.rm(dest, { force: true }).catch((cleanupError) => {
        console.warn('[updater] 清理未完成的安装包失败:', cleanupError.message)
      })
    }
    throw error
  } finally {
    state.downloading = false
  }
}

export async function installUpdate() {
  if (state.installing) throw new Error('更新安装已经开始，请勿重复操作')
  state.installing = true
  try { return await installUpdateImpl() }
  catch (error) { state.installing = false; throw error }
}

async function installUpdateImpl() {
  if (process.platform !== 'win32') throw new Error('Electron 自动更新仅支持 Windows NSIS 安装包')
  assertSupportedInstallerPackage(state.packageInfo, state.manifestKind)
  if (!state.latest?.version) throw new Error('更新目标版本缺失，请重新检查更新')
  if (!state.installerFile || !existsSync(state.installerFile)) {
    throw new Error('安装包尚未下载完成，请重新检查更新')
  }
  const target = appDir()
  if (!target) {
    throw new Error('开发模式下不执行自动安装，请使用打包后的安装版测试（或设置 TOOLBOX_APP_DIR 指向安装目录）')
  }
  if (!existsSync(target)) throw new Error(`应用目录不存在：${target}`)

  const exePath = app.getPath('exe')
  const helperSource = path.join(__dirname, 'apply-installer.js')
  const workDir = path.join(app.getPath('userData'), 'updates')
  const logFile = path.join(workDir, 'install.log')

  // 安装助手必须落在应用目录之外：安装过程会重建应用目录下的全部文件，
  // 若助手位于 app.asar 内，安装到一半就会把自己覆盖掉。
  await fs.mkdir(workDir, { recursive: true })
  // A packaged Electron app uses its own executable as the Node runtime.
  // Running the helper from that executable would keep the installed EXE
  // mapped while NSIS tries to uninstall the old version. Use a copy outside
  // the installation directory so the helper cannot lock the live payload.
  const runtimeCopy = getRuntimeCopyPath(workDir)
  const runtimeDir = path.dirname(runtimeCopy)
  const tempScript = path.join(runtimeDir, 'apply-installer.mjs')
  await prepareInstallerRuntime(process.execPath, runtimeCopy)
  await fs.copyFile(helperSource, tempScript)
  await fs.copyFile(path.join(__dirname, 'installer-verification.js'), path.join(runtimeDir, 'installer-verification.js'))

  sendProgress(97, '正在验证更新助手能否启动…')

  try {
    await startInstallerHelper(
      runtimeCopy,
      [
        tempScript,
        '--pid', String(process.pid),
        '--installer', state.installerFile,
        '--target', target,
        '--exe', exePath,
        '--product', app.getName(),
        '--version', state.latest.version,
        '--bootstrap-ipc', '1',
        '--log', logFile,
        '--cleanup', tempScript,
        '--cleanup-helper', path.join(runtimeDir, 'installer-verification.js'),
        '--cleanup-runtime', runtimeCopy
      ],
      state.latest.version
    )
  } catch (error) {
    await fs.appendFile(logFile, `[${new Date().toISOString()}] 更新助手启动失败，保留当前应用：${error.message}\n`).catch(() => {})
    throw new Error(`启动安装助手失败：${error.message}`, { cause: error })
  }
  sendProgress(98, '更新助手已就绪，正在退出并安装更新…')

  setTimeout(() => app.exit(0), 350)
  return { ok: true, restarting: true }
}

export function getUpdateInfo() {
  return {
    mode: 'electron',
    currentVersion: normalizeVersion(app.getVersion()),
    packaged: app.isPackaged,
    feed: resolveFeed(),
    appDir: appDir() || null,
    platform: process.platform,
    signature: state.signature
  }
}

export function registerUpdaterIpc(ipcMain) {
  ipcMain.handle('update:info', () => getUpdateInfo())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())
}

/** 启动后自动检查一次，发现新版本立即推送事件让渲染进程弹窗 */
export function scheduleStartupCheck(delay = 4000) {
  setTimeout(async () => {
    try {
      const result = await checkForUpdates()
      if (result.hasUpdate) {
        sendEvent({
          type: 'available',
          currentVersion: result.currentVersion,
          latest: result.latest
        })
      }
    } catch (error) {
      // 启动时更新源不可用（离线 / 未配置）不弹窗打扰，仅在控制台留痕
      console.warn('[updater] 启动检查跳过:', error.message)
    }
  }, delay)
}
