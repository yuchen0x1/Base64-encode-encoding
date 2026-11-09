import { reactive, computed } from 'vue'
import { isNewerVersion, normalizeVersion } from '../../shared/version.js'

/**
 * 统一的更新状态机，同时适配三种运行环境：
 *  1. electron  —— 通过 preload 暴露的 window.toolboxUpdater 走 IPC，支持下载 + 替换 + 自动重启
 *  2. server    —— 网页版由本地更新服务器托管，走 /api/update/*，支持下载 + 替换 + 服务器自重启
 *  3. static    —— 纯静态托管，仅能检测版本并刷新缓存加载已部署的新文件
 *
 * 所有状态为模块级单例，App 侧边栏版本入口与弹窗共享同一份状态。
 */

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

const state = reactive({
  open: false,
  mode: 'unknown',
  status: 'idle', // idle | checking | uptodate | available | downloading | ready | restarting | error
  currentVersion: APP_VERSION,
  buildTime: BUILD_TIME,
  latest: null,
  progress: 0,
  message: '',
  error: '',
  lastCheckedAt: 0,
  autoPrompted: false
})

let electronBound = false
let checkPromise = null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function apiUrl(relative) {
  const base = new URL('.', document.baseURI)
  return new URL(relative, base).toString()
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function bindElectron() {
  if (electronBound || typeof window === 'undefined' || !window.toolboxUpdater) return
  electronBound = true
  state.mode = 'electron'
  window.toolboxUpdater.onEvent((event) => {
    if (!event || !event.type) return
    if (event.type === 'progress') {
      state.status = 'downloading'
      state.progress = Math.round(event.percent || 0)
      state.message = event.message || '正在下载更新包…'
    } else if (event.type === 'available') {
      if (event.latest) state.latest = event.latest
      state.currentVersion = event.currentVersion || state.currentVersion
      state.status = 'available'
      state.lastCheckedAt = Date.now()
      if (!state.autoPrompted) {
        state.autoPrompted = true
        state.open = true
      }
    } else if (event.type === 'error') {
      state.status = 'error'
      state.error = event.message || '更新失败'
    }
  })
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { cache: 'no-store', ...options })
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error('返回内容不是 JSON')
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

/** 识别当前托管模式：本地更新服务 / 纯静态站点 */
async function detectMode() {
  if (state.mode === 'electron') return 'electron'
  try {
    const data = await fetchJson(apiUrl('api/version'))
    if (data && data.mode === 'server') {
      state.mode = 'server'
      if (data.version) state.currentVersion = normalizeVersion(data.version)
      if (data.buildTime) state.buildTime = data.buildTime
      return 'server'
    }
  } catch {
    /* 非服务端模式，继续探测静态模式 */
  }
  state.mode = 'static'
  return 'static'
}

async function checkStatic() {
  const data = await fetchJson(apiUrl(`version.json?t=${Date.now()}`))
  if (!data || !data.version) throw new Error('版本清单格式异常')
  const current = normalizeVersion(state.currentVersion)
  const latest = normalizeVersion(data.version)
  return {
    hasUpdate: isNewerVersion(latest, current),
    currentVersion: current,
    latest: { version: latest, notes: data.notes || [], buildTime: data.buildTime || null }
  }
}

/**
 * 检查更新
 * @param {{manual?: boolean}} options manual=true 时给出"已是最新"的明确反馈
 */
export function checkForUpdates(options = {}) {
  const { manual = false, silent = false } = options
  if (checkPromise) return checkPromise

  state.status = 'checking'
  state.error = ''
  state.progress = 0
  state.message = '正在检查更新…'

  checkPromise = (async () => {
    try {
      bindElectron()
      const mode = await detectMode()
      let result

      if (mode === 'electron') {
        result = await window.toolboxUpdater.check()
        if (result && result.supported === false) {
          state.status = 'error'
          state.error = result.reason || '当前环境不支持自动更新'
          state.open = true
          return { hasUpdate: false, supported: false }
        }
      } else if (mode === 'server') {
        result = await fetchJson(apiUrl(`api/update/check?t=${Date.now()}`))
        if (result.error) throw new Error(result.error)
      } else {
        result = await checkStatic()
      }

      state.currentVersion = normalizeVersion(result.currentVersion || state.currentVersion)
      state.lastCheckedAt = Date.now()

      if (result.hasUpdate && result.latest) {
        state.latest = {
          ...result.latest,
          sizeText: formatBytes(result.latest.size)
        }
        state.status = 'available'
        if (manual || !state.open) state.open = true
        return { hasUpdate: true, latest: state.latest }
      }

      state.latest = null
      state.status = 'uptodate'
      if (manual) {
        state.open = true
      }
      return { hasUpdate: false }
    } catch (error) {
      if (silent) {
        // 启动时的静默检查失败不打扰用户，保持待检查状态
        state.status = 'idle'
        state.error = ''
        return { hasUpdate: false, error: error.message, silent: true }
      }
      state.status = 'error'
      state.error = error.message || '检查更新失败'
      if (manual) state.open = true
      return { hasUpdate: false, error: state.error }
    } finally {
      checkPromise = null
    }
  })()

  return checkPromise
}

async function hardReload(version) {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch { /* 忽略缓存清理失败 */ }
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((reg) => reg.unregister()))
    }
  } catch { /* 忽略 SW 注销失败 */ }
  const url = new URL(window.location.href)
  url.searchParams.set('_v', version || Date.now().toString())
  window.location.replace(url.toString())
}

async function applyInServerMode() {
  const target = normalizeVersion(state.latest?.version || '')
  state.status = 'downloading'
  state.progress = 2
  state.message = '正在下载更新包…'

  await fetchJson(apiUrl('api/update/apply'), { method: 'POST' })

  const deadline = Date.now() + 3 * 60 * 1000
  let restartDetected = false
  while (Date.now() < deadline) {
    await sleep(500)
    try {
      const job = await fetchJson(apiUrl(`api/update/progress?t=${Date.now()}`))
      state.progress = Math.max(state.progress, Math.round(job.percent || 0))
      if (job.message) state.message = job.message
      if (job.status === 'error') throw new Error(job.error || '更新失败')
      if (job.status === 'done' || job.status === 'restarting') {
        restartDetected = true
        state.status = 'restarting'
        state.progress = 100
        state.message = '服务器正在重启，页面将自动刷新…'
        break
      }
      if (job.status === 'downloading' || job.status === 'verifying' || job.status === 'extracting' || job.status === 'swapping') {
        state.status = 'downloading'
      }
    } catch (error) {
      // 替换/重启期间连接会短暂中断，属于预期行为
      if (restartDetected) break
      if (String(error.message).includes('HTTP 5')) throw error
    }
  }

  if (!restartDetected) {
    state.status = 'restarting'
    state.message = '服务器正在重启，页面将自动刷新…'
  }

  // 等待新进程接管端口并确认版本号
  const versionDeadline = Date.now() + 60 * 1000
  while (Date.now() < versionDeadline) {
    await sleep(800)
    try {
      const info = await fetchJson(apiUrl(`api/version?t=${Date.now()}`))
      if (!target || normalizeVersion(info.version) === target) {
        await hardReload(target)
        return
      }
    } catch { /* 端口尚未就绪 */ }
  }
  throw new Error('服务器重启超时，请手动刷新页面')
}

async function applyInStaticMode() {
  state.status = 'restarting'
  state.message = '正在清理缓存并加载新版本…'
  state.progress = 100
  await sleep(400)
  await hardReload(state.latest?.version)
}

async function applyInElectronMode() {
  state.status = 'downloading'
  state.progress = 0
  state.message = '正在下载更新包…'
  const result = await window.toolboxUpdater.download()
  if (!result || result.ok === false) throw new Error(result?.error || '下载失败')
  state.status = 'ready'
  state.progress = 100
  state.message = '更新包已就绪，点击「立即重启」完成安装'
  return result
}

/** 点击「立即更新」 */
export async function downloadUpdate() {
  if (!state.latest) throw new Error('没有可用的更新')
  state.error = ''
  try {
    if (state.mode === 'electron') return await applyInElectronMode()
    if (state.mode === 'server') return await applyInServerMode()
    return await applyInStaticMode()
  } catch (error) {
    state.status = 'error'
    state.error = error.message || '更新失败'
    throw error
  }
}

/** 桌面端：安装并自动重启 */
export async function installUpdate() {
  if (state.mode !== 'electron') return downloadUpdate()
  state.status = 'restarting'
  state.message = '正在安装并重启，应用将自动打开新版本…'
  try {
    const result = await window.toolboxUpdater.install()
    if (result && result.ok === false) throw new Error(result.error || '安装失败')
    return result
  } catch (error) {
    state.status = 'error'
    state.error = error.message || '安装失败'
    throw error
  }
}

export function openUpdatePanel() {
  // 打开面板只展示当前版本，由用户点击「立即检查」触发检测
  // （启动静默检查 / 桌面主进程推送发现的新版本会直接以 available 状态呈现）
  state.open = true
}

export function closeUpdatePanel() {
  state.open = false
}

export function useUpdater() {
  bindElectron()
  const hasUpdate = computed(() => state.status === 'available' || state.status === 'downloading' || state.status === 'ready')
  const modeLabel = computed(() => {
    if (state.mode === 'electron') return '桌面版'
    if (state.mode === 'server') return '网页版 · 本地更新服务'
    if (state.mode === 'static') return '网页版 · 静态部署'
    return '检测中'
  })
  const primaryLabel = computed(() => {
    if (state.status === 'available') return '立即更新'
    if (state.status === 'ready') return '立即重启'
    if (state.status === 'restarting') return '正在重启…'
    if (state.status === 'checking') return '检查中…'
    return '立即检查'
  })
  return {
    state,
    hasUpdate,
    modeLabel,
    primaryLabel,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    openUpdatePanel,
    closeUpdatePanel
  }
}

/** 启动后的静默检查（发现新版本才弹窗） */
export function scheduleStartupCheck(delay = 3500) {
  if (typeof window === 'undefined') return
  if (state.startupScheduled) return
  state.startupScheduled = true
  setTimeout(() => {
    checkForUpdates({ manual: false, silent: true }).then((result) => {
      if (result && result.hasUpdate) {
        state.autoPrompted = true
        state.open = true
      }
    })
  }, delay)
}
