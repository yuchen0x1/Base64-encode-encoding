/**
 * 桌面端更新器（Electron 主进程）
 *
 * 流程：读取更新源 version.json → 版本比较 → 下载 zip（带进度）→ SHA-256 校验
 *      → 解压到暂存目录 → 启动独立替换进程 → 主进程退出 → 覆盖文件 → 拉起新版本
 *
 * 更新源优先级：
 *   1. 环境变量 TOOLBOX_UPDATE_FEED（目录或 version.json 的 http(s) 地址）
 *   2. 程序目录下的 update-config.json 的 feed 字段
 *   3. 程序目录下的 updates/ 目录（开发环境为项目根 updates/desktop）
 */
import { app, net, BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { extractZip } from '../shared/zip.js'
import { isNewerVersion, normalizeVersion } from '../shared/version.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const state = {
  latest: null,
  manifestBase: '',
  packageInfo: null,
  downloadedFile: '',
  stagingDir: '',
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

function appDir() {
  return process.env.TOOLBOX_APP_DIR || (app.isPackaged ? path.dirname(app.getPath('exe')) : '')
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

  return app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'updates')
    : path.join(__dirname, '..', 'updates', 'desktop')
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
  const url = info.url || `geek-toolbox-desktop-${manifest.version}.zip`
  if (/^https?:\/\//i.test(url)) return { ...info, url, kind: 'http' }
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
    throw new Error(`${error.message}（更新源：${feed}）`)
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
    appDir: appDir() || null
  }
}

export async function downloadUpdate() {
  if (!state.latest) throw new Error('没有可用的更新')
  if (state.downloading) throw new Error('更新包正在下载中')

  const pkg = state.packageInfo
  if (!pkg) throw new Error('更新包信息缺失，请重新检查更新')

  state.downloading = true
  try {
    const baseDir = path.join(app.getPath('userData'), 'updates')
    const dest = path.join(baseDir, `geek-toolbox-${state.latest.version}.zip`)
    sendProgress(1, '正在下载更新包…')

    const received = await downloadTo(pkg.url, dest, pkg.size, (ratio) => {
      sendProgress(2 + ratio * 78, `正在下载更新包… ${Math.round(ratio * 100)}%`)
    })

    sendProgress(82, '正在校验更新包…')
    if (pkg.sha256) {
      const actual = await hashFile(dest)
      if (actual.toLowerCase() !== String(pkg.sha256).toLowerCase()) {
        await fs.rm(dest, { force: true })
        throw new Error(`更新包校验失败（期望 ${String(pkg.sha256).slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
      }
    }

    sendProgress(88, '正在解压更新包…')
    const staging = path.join(baseDir, `staging-${state.latest.version}`)
    await fs.rm(staging, { recursive: true, force: true })
    await extractZip(await fs.readFile(dest), staging)

    const entries = await fs.readdir(staging)
    const hasExecutable = entries.some((name) => name.toLowerCase().endsWith('.exe'))
    // 支持两种更新包：完整程序包（根目录含 exe）与增量包（仅替换 resources/app.asar）
    const hasAsar = existsSync(path.join(staging, 'resources', 'app.asar'))
    if (!hasExecutable && !hasAsar) {
      await fs.rm(staging, { recursive: true, force: true })
      throw new Error('更新包结构异常：未找到可执行文件或 resources/app.asar')
    }

    state.downloadedFile = dest
    state.stagingDir = staging
    sendProgress(95, '更新包已就绪')
    return { ok: true, size: received, staging }
  } finally {
    state.downloading = false
  }
}

export async function installUpdate() {
  if (!state.stagingDir) throw new Error('更新包尚未下载完成')
  const target = appDir()
  if (!target) {
    throw new Error('开发模式下不执行自动替换，请使用打包后的程序测试（或设置 TOOLBOX_APP_DIR 指向可替换的安装目录）')
  }
  if (!existsSync(target)) throw new Error(`应用目录不存在：${target}`)

  const exePath = app.getPath('exe')
  const exeName = path.basename(exePath)
  const applyScript = path.join(__dirname, 'apply-update.js')
  const workDir = path.join(app.getPath('userData'), 'updates')
  const logFile = path.join(workDir, 'apply.log')

  // 关键：替换脚本必须位于应用目录之外。
  // 打包后脚本在 app.asar 内，而 app.asar 会被本次更新覆盖，
  // 直接执行会导致文件占用甚至脚本被替换后无法继续运行。
  await fs.mkdir(workDir, { recursive: true })
  const tempScript = path.join(workDir, `apply-update-${Date.now()}.mjs`)
  await fs.copyFile(applyScript, tempScript)

  sendProgress(98, '正在准备重启安装…')

  const child = spawn(
    process.execPath,
    [
      tempScript,
      '--pid', String(process.pid),
      '--staging', state.stagingDir,
      '--target', target,
      '--exe', path.join(target, exeName),
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
