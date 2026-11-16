import { reactive, computed } from 'vue'
import { normalizeVersion } from '../../shared/version.js'

/** Windows 桌面更新状态机；侧边栏与弹窗共享同一份状态。 */

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''
// Electron 用 file:// 加载页面，无法 fetch 同目录的 version.json，
// 因此当前版本的更新日志在构建期由 vite.config.js 注入，供 Windows 界面显示。
const RELEASE_NOTES = Array.isArray(__RELEASE_NOTES__) ? __RELEASE_NOTES__ : []
const RELEASE_DATE = typeof __RELEASE_DATE__ === 'string' ? __RELEASE_DATE__ : ''

const state = reactive({
  open: false,
  mode: 'preview',
  status: 'idle', // idle | checking | uptodate | available | downloading | ready | restarting | error
  currentVersion: APP_VERSION,
  buildTime: BUILD_TIME,
  currentNotes: RELEASE_NOTES,
  currentReleaseDate: RELEASE_DATE,
  portable: false,
  latest: null,
  progress: 0,
  message: '',
  error: '',
  lastCheckedAt: 0,
  autoPrompted: false
})

let electronBound = false
let checkPromise = null

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function bindElectron() {
  if (electronBound) return true
  if (typeof window === 'undefined' || !window.toolboxUpdater) return false
  electronBound = true
  state.mode = 'electron'
  Promise.resolve(window.toolboxUpdater.getInfo?.()).then((info) => {
    state.portable = Boolean(info?.portable)
  }).catch(() => {})
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
  return true
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

  checkPromise = Promise.resolve().then(async () => {
    try {
      if (!bindElectron()) throw new Error('请在 Windows 桌面应用中检查更新；界面预览不支持自动更新')
      const result = await window.toolboxUpdater.check()
      if (result && result.supported === false) {
        state.status = 'error'
        state.error = result.reason || '当前运行方式不支持自动更新'
        state.open = true
        return { hasUpdate: false, supported: false }
      }

      state.currentVersion = normalizeVersion(result.currentVersion || state.currentVersion)
      state.portable = Boolean(result.portable)
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
  })

  return checkPromise
}

async function applyInElectronMode() {
  state.status = 'downloading'
  state.progress = 0
  state.message = '正在下载安装包…'
  const result = await window.toolboxUpdater.download()
  if (!result || result.ok === false) throw new Error(result?.error || '下载失败')
  state.status = 'ready'
  state.progress = 100
  state.message = '安装包已就绪，点击「立即安装」后会自动安装并重启'
  return result
}

/** 点击「立即更新」 */
export async function downloadUpdate() {
  if (!state.latest) throw new Error('没有可用的更新')
  state.error = ''
  try {
    if (!bindElectron()) throw new Error('请在 Windows 桌面应用中下载更新')
    return await applyInElectronMode()
  } catch (error) {
    state.status = 'error'
    state.error = error.message || '更新失败'
    throw error
  }
}

/** 取消桌面端更新包下载；取消后保留检查结果，允许用户稍后重试。 */
export async function cancelDownloadUpdate() {
  if (state.status !== 'downloading') return { ok: false, cancelled: false }
  try {
    if (!bindElectron() || typeof window.toolboxUpdater.cancel !== 'function') {
      throw new Error('当前运行方式不支持取消更新下载')
    }
    const result = await window.toolboxUpdater.cancel()
    if (result?.cancelled) state.message = '正在取消下载…'
    return result
  } catch (error) {
    state.error = error.message || '取消下载失败'
    return { ok: false, cancelled: false, error: state.error }
  }
}

/** 桌面端：安装并自动重启 */
export async function installUpdate() {
  state.status = 'restarting'
  state.message = '正在安装并重启，应用将自动打开新版本…'
  try {
    if (!bindElectron()) throw new Error('请在 Windows 桌面应用中安装更新')
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
    if (state.mode === 'electron') return state.portable ? 'Windows · 开发运行' : 'Windows · 已安装'
    return '界面开发预览'
  })
  const primaryLabel = computed(() => {
    if (state.status === 'available') return '立即更新'
    if (state.status === 'ready') return '立即安装并重启'
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
    cancelDownloadUpdate,
    installUpdate,
    openUpdatePanel,
    closeUpdatePanel
  }
}

/** 启动后的静默检查（发现新版本才弹窗） */
export function scheduleStartupCheck(delay = 3500) {
  if (!bindElectron()) return
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
