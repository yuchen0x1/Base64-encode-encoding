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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_UPDATE_FEED = 'https://github.com/yuchen0x1/Base64-encode-encoding/releases/latest/download/version.json'

const state = {
  latest: null,
  manifestBase: '',
  packageInfo: null,
  installerFile: '',
  downloading: false
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

async function readManifest(feed) {
  if (/^https?:\/\//i.test(feed)) {
    const url = feed.endsWith('.json') ? feed : `${feed.replace(/\/$/, '')}/version.json`
    const res = await httpFetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`更新源返回 HTTP ${res.status}`)
    return { manifest: await res.json(), base: url.replace(/\/version\.json.*$/i, '') }
  }
  const base = feed.endsWith('.json') ? path.dirname(feed) : feed
  const file = feed.endsWith('.json') ? feed : path.join(feed, 'version.json')
  if (!existsSync(file)) {
    throw new Error(`未找到更新源清单：${file}`)
  }
  const manifest = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  return { manifest, base }
}

function resolvePackage(manifest, base) {
  const info = manifest.package || {}
  const url = info.url || `GeekToolbox-Setup-${manifest.version}.exe`
  if (/^https?:\/\//i.test(url)) return { ...info, url, kind: 'http' }

  // version.json 可能来自 HTTP 更新源。不能用 path.join 拼接 URL，
  // Windows 会把 https:// 错误转换成文件路径，导致下载阶段找不到更新包。
  if (/^https?:\/\//i.test(base)) {
    const feedBase = `${base.replace(/\/$/, '')}/`
    return { ...info, url: new URL(url, feedBase).toString(), kind: 'http' }
  }

  return { ...info, url: path.isAbsolute(url) ? url : path.join(base, url), kind: 'file' }
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

async function downloadTo(url, dest, expectedSize, onProgress) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const handle = await fs.open(dest, 'w')
  try {
    if (/^https?:\/\//i.test(url)) {
      const res = await httpFetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`下载更新包失败：HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length') || expectedSize || 0)
      const reader = res.body.getReader()
      let received = 0
      let lastReport = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        await handle.write(value)
        received += value.length
        const now = Date.now()
        if (now - lastReport > 120) {
          lastReport = now
          onProgress(total ? received / total : 0)
        }
      }
      onProgress(1)
      return received
    }

    const stat = await fs.stat(url)
    const total = stat.size || 1
    const buffer = Buffer.alloc(256 * 1024)
    const source = await fs.open(url, 'r')
    let received = 0
    try {
      for (;;) {
        const { bytesRead } = await source.read(buffer, 0, buffer.length, received)
        if (!bytesRead) break
        await handle.write(buffer.subarray(0, bytesRead), 0, bytesRead, received)
        received += bytesRead
        onProgress(received / total)
      }
    } finally {
      await source.close()
    }
    return received
  } finally {
    await handle.close()
  }
}

export async function checkForUpdates() {
  const currentVersion = normalizeVersion(app.getVersion())
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
  const pkg = resolvePackage(manifest, base)
  state.manifestBase = base
  state.packageInfo = pkg

  const hasUpdate = isNewerVersion(latestVersion, currentVersion)
  if (hasUpdate) {
    state.latest = {
      version: latestVersion,
      buildTime: manifest.buildTime || null,
      notes: Array.isArray(manifest.notes) ? manifest.notes : [],
      releaseDate: manifest.releaseDate || null,
      size: pkg.size || null,
      force: Boolean(manifest.force)
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
  if (!state.latest) throw new Error('没有可用的更新')
  if (state.downloading) throw new Error('更新包正在下载中')

  const pkg = state.packageInfo
  if (!pkg) throw new Error('更新包信息缺失，请重新检查更新')

  state.downloading = true
  try {
    const baseDir = path.join(app.getPath('userData'), 'updates')
    const dest = path.join(baseDir, installerFileName(pkg, state.latest.version))
    await fs.mkdir(baseDir, { recursive: true })
    await fs.rm(dest, { force: true })

    sendProgress(1, '正在下载安装包…')
    const received = await downloadTo(pkg.url, dest, pkg.size, (ratio) => {
      sendProgress(2 + ratio * 86, `正在下载安装包… ${Math.round(ratio * 100)}%`)
    })

    sendProgress(90, '正在校验安装包…')
    if (pkg.sha256) {
      const actual = await hashFile(dest)
      if (actual.toLowerCase() !== String(pkg.sha256).toLowerCase()) {
        await fs.rm(dest, { force: true })
        throw new Error(`安装包校验失败（期望 ${String(pkg.sha256).slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
      }
    } else {
      // 服务端记录警告：缺失哈希意味着无法防篡改，只能依赖 HTTPS 传输安全
      console.warn('[updater] 更新清单缺少 package.sha256，已跳过完整性校验')
    }

    state.installerFile = dest
    sendProgress(96, '安装包已就绪')
    return { ok: true, size: received, installer: dest }
  } finally {
    state.downloading = false
  }
}

export async function installUpdate() {
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
  const tempScript = path.join(workDir, `apply-installer-${Date.now()}.mjs`)
  await fs.copyFile(helperSource, tempScript)

  sendProgress(98, '正在退出并安装更新…')

  const child = spawn(
    process.execPath,
    [
      tempScript,
      '--pid', String(process.pid),
      '--installer', state.installerFile,
      '--target', target,
      '--exe', exePath,
      '--product', app.getName(),
      '--log', logFile,
      '--cleanup', tempScript
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    }
  )
  child.unref()

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
    platform: process.platform
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
