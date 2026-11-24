import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Electron IPC / navigation security primitives.
 *
 * These helpers intentionally have no Electron import so they can be covered
 * by fast Node tests without starting a browser process.
 */

export const UPDATE_IPC_CHANNELS = Object.freeze([
  'update:info',
  'update:check',
  'update:download',
  'update:cancel',
  'update:install'
])

// Only official destinations used by the application may be opened externally.
// Scheme, credentials, host and non-default ports are all checked.
export const SAFE_EXTERNAL_HOSTS = Object.freeze([
  'github.com',
  'www.github.com',
  'qm.qq.com',
  'toolhelper.cn',
  'www.toolhelper.cn',
  'star-history.com',
  'www.star-history.com'
])

function accessDenied() {
  const error = new Error('更新接口拒绝未授权调用')
  error.code = 'ERR_IPC_ACCESS_DENIED'
  return error
}

function normalizePathForComparison(filePath) {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function normalizedDevServer(devServerUrl) {
  try {
    const url = new URL(devServerUrl)
    if (url.protocol !== 'http:' || url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

/**
 * Validate the top-level document URL that owns a renderer.
 * Production accepts exactly the packaged dist/index.html file; development
 * accepts exactly the configured Vite origin and path.
 */
export function isTrustedRendererUrl(rawUrl, {
  isPackaged,
  indexFile,
  devServerUrl = 'http://localhost:5173'
} = {}) {
  if (typeof rawUrl !== 'string' || !rawUrl || rawUrl.length > 4096) return false

  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.username || url.password) return false

  if (!isPackaged) {
    const expected = normalizedDevServer(devServerUrl)
    if (!expected) return false
    return url.origin === expected.origin &&
      url.pathname === (expected.pathname || '/') &&
      url.search === '' &&
      url.hash === ''
  }

  if (url.protocol !== 'file:' || url.host || url.search || url.hash) return false
  if (typeof indexFile !== 'string' || !indexFile) return false
  try {
    return normalizePathForComparison(fileURLToPath(url)) === normalizePathForComparison(indexFile)
  } catch {
    return false
  }
}

/**
 * Throw unless the invoke event came from the main frame of the one trusted
 * application window. This also rejects detached frames, iframes, stale
 * webContents and an already destroyed window.
 */
export function assertTrustedIpcSender(event, {
  getMainWindow,
  isPackaged,
  indexFile,
  devServerUrl = 'http://localhost:5173'
} = {}) {
  const window = typeof getMainWindow === 'function' ? getMainWindow() : null
  if (!window || window.isDestroyed?.() === true) throw accessDenied()

  const contents = window.webContents
  if (!contents || contents.isDestroyed?.() === true) throw accessDenied()

  const frame = event?.senderFrame
  if (!frame || event?.sender !== contents) throw accessDenied()
  if (frame !== contents.mainFrame || frame.parent || frame.detached === true) throw accessDenied()
  if (!isTrustedRendererUrl(frame.url, { isPackaged, indexFile, devServerUrl })) throw accessDenied()
  return true
}

/**
 * Wrap a handler so it never receives the Electron IpcMainInvokeEvent and all
 * calls pass through the same sender validation. Handlers are not invoked when
 * validation fails.
 */
export function createTrustedIpcHandler(handler, options) {
  if (typeof handler !== 'function') throw new TypeError('IPC handler 必须是函数')
  return function trustedIpcHandler(event, ...args) {
    assertTrustedIpcSender(event, options)
    return handler(...args)
  }
}

export function registerTrustedIpcHandlers(ipcMain, handlers, options) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') throw new TypeError('ipcMain.handle 不可用')
  if (!handlers || typeof handlers !== 'object' || Array.isArray(handlers)) {
    throw new TypeError('IPC handlers 必须是对象')
  }
  const registered = []
  for (const [channel, handler] of Object.entries(handlers)) {
    if (!UPDATE_IPC_CHANNELS.includes(channel)) {
      throw new Error(`未登记的 IPC 通道：${channel}`)
    }
    ipcMain.handle(channel, createTrustedIpcHandler(handler, options))
    registered.push(channel)
  }
  return registered
}

/**
 * Return a normalized HTTPS URL only when it points at an approved host.
 * HTTP, custom schemes, credentials, fragments and non-default ports are denied.
 */
export function resolveSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl || rawUrl.length > 2048) return null
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (url.port && url.port !== '443') return null
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!SAFE_EXTERNAL_HOSTS.includes(hostname)) return null
  return url.href
}
