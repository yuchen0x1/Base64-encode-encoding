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
import { app, net } from 'electron'
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isNewerVersion, normalizeVersion } from '../shared/version.js'
import { fetchLatestRelease, fetchReleaseByVersion, getReleaseAsset, RELEASES_URL } from '../shared/github-release.js'
import { assertSupportedInstallerPackage, normalizeSignatureMetadata } from './update-validation.js'
import { prepareInstallerRuntime, startInstallerHelper } from './installer-bootstrap.js'
import { registerTrustedIpcHandlers } from './ipc-security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_UPDATE_FEED = `${RELEASES_URL}/latest/download/version.json`
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_UPDATE_REDIRECTS = 10
export const GH_PROXY_BASE_URL = 'https://gh-proxy.org/'
export const GH_PROXY_BACKUP_BASE_URL = 'https://ghproxy.net/'
const ALLOWED_PUBLIC_PROXY_HOSTS = new Set(['gh-proxy.org', 'ghproxy.net'])
export const MAX_UPDATE_PACKAGE_BYTES = 512 * 1024 * 1024
export const UPDATE_DOWNLOAD_IDLE_TIMEOUT_MS = 30_000
export const UPDATE_DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SECOND = 64 * 1024
export const UPDATE_DOWNLOAD_SLOW_WINDOW_MS = 3_000
export const UPDATE_DOWNLOAD_SLOW_MIN_BYTES = 256 * 1024
export const UPDATE_DOWNLOAD_SLOW_WINDOWS = 2
export const UPDATE_ROUTE_PROBE_MIN_PACKAGE_BYTES = 1024 * 1024
export const UPDATE_ROUTE_PROBE_BYTES = 64 * 1024
export const UPDATE_ROUTE_PROBE_TIMEOUT_MS = 8_000
const UPDATE_ROUTE_PROBE_LATENCY_WEIGHT_MS = 250
const UPDATE_DOWNLOAD_CANCELLED = 'ERR_UPDATE_DOWNLOAD_CANCELLED'
const UPDATE_DOWNLOAD_SLOW = 'ERR_UPDATE_DOWNLOAD_SLOW'
const UPDATE_DOWNLOAD_RANGE_MISMATCH = 'ERR_UPDATE_DOWNLOAD_RANGE_MISMATCH'

const state = {
  latest: null,
  manifestKind: '',
  packageInfo: null,
  installerFile: '',
  downloading: false,
  downloadController: null,
  installing: false,
  signature: null
}

let checkPromise
let mainWindowProvider = () => null
let pendingEvent = null
let pendingLoadCleanup = null
let startupCheckTimer = null

function getWindow() {
  const window = mainWindowProvider()
  if (!window || window.isDestroyed?.() === true || window.webContents?.isDestroyed?.()) return null
  return window
}

function clearPendingEvent() {
  pendingEvent = null
  if (pendingLoadCleanup) {
    pendingLoadCleanup()
    pendingLoadCleanup = null
  }
}

function sendEvent(payload) {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  const contents = win.webContents
  if (contents.isDestroyed()) return
  if (contents.isLoading()) {
    // Coalesce updates while the document is loading, and keep exactly one
    // listener so download progress cannot accumulate event listeners.
    pendingEvent = payload
    if (pendingLoadCleanup) return
    const onLoaded = () => {
      pendingLoadCleanup = null
      const current = getWindow()
      const next = pendingEvent
      pendingEvent = null
      if (!current || current.webContents !== contents || contents.isDestroyed() || !next) return
      try {
        contents.send('update:event', next)
      } catch {
        /* renderer disappeared between the liveness check and send */
      }
    }
    pendingLoadCleanup = () => contents.removeListener('did-finish-load', onLoaded)
    contents.once('did-finish-load', onLoaded)
    return
  }
  clearPendingEvent()
  try {
    contents.send('update:event', payload)
  } catch {
    /* renderer disappeared between the liveness check and send */
  }
}

function sendProgress(percent, message, bytesPerSecond = 0) {
  sendEvent({ type: 'progress', percent: Math.max(0, Math.min(100, Math.round(percent))), message, bytesPerSecond })
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

function toFetchHeaders(headers = {}) {
  const output = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) output.append(name, item)
    } else if (value !== undefined && value !== null) {
      output.set(name, value)
    }
  }
  return output
}

function toRequestHeaders(headers) {
  if (!headers) return undefined
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  return headers
}

function electronRequestFetch(url, options = {}) {
  const initialUrl = new URL(url).href
  const headers = toRequestHeaders(options.headers)
  const redirectMode = options.redirect || 'follow'

  return new Promise((resolve, reject) => {
    let currentUrl = initialUrl
    let redirectCount = 0
    let redirectError
    let promiseSettled = false
    let responseReceived = false
    let bodyController
    let bodyFinished = false
    let response
    let abortListener

    const cleanupAbortListener = () => {
      if (abortListener) options.signal?.removeEventListener('abort', abortListener)
      abortListener = null
    }
    const fail = (error) => {
      if (promiseSettled) return
      promiseSettled = true
      cleanupAbortListener()
      reject(error)
    }
    const abortRequest = () => {
      const error = options.signal?.reason instanceof Error
        ? options.signal.reason
        : new Error('更新请求已取消')
      if (responseReceived && bodyController && !bodyFinished) {
        bodyFinished = true
        cleanupAbortListener()
        try { bodyController.error(error) } catch { /* stream already closed */ }
      } else {
        fail(error)
      }
      try { request.abort() } catch { /* request may already be closed */ }
      response?.destroy(error)
    }

    let request
    try {
      request = net.request({
        url: initialUrl,
        method: options.method || 'GET',
        headers,
        cache: options.cache || 'default',
        redirect: 'manual',
        credentials: 'omit',
        useSessionCookies: false
      })
    } catch (error) {
      fail(error)
      return
    }

    request.on('redirect', (_statusCode, _method, redirectUrl) => {
      if (promiseSettled) return
      try {
        if (redirectMode === 'error') {
          throw new Error('更新请求不允许重定向')
        }
        if (redirectCount >= MAX_UPDATE_REDIRECTS) {
          throw new Error('更新请求重定向次数超过上限')
        }
        redirectCount += 1
        const nextUrl = new URL(redirectUrl, currentUrl).href
        assertAllowedUpdateRedirect(nextUrl, initialUrl, '更新重定向地址')
        currentUrl = nextUrl
        request.followRedirect()
      } catch (error) {
        redirectError = error
        fail(error)
        try { request.abort() } catch { /* request may already be closed */ }
      }
    })

    request.on('response', (incoming) => {
      if (promiseSettled) {
        incoming.destroy()
        return
      }
      responseReceived = true
      promiseSettled = true
      response = incoming
      const responseHeaders = toFetchHeaders(incoming.headers)
      const body = new ReadableStream({
        start(controller) {
          bodyController = controller
          const close = () => {
            if (bodyFinished) return
            bodyFinished = true
            cleanupAbortListener()
            controller.close()
          }
          const error = (reason) => {
            if (bodyFinished) return
            bodyFinished = true
            cleanupAbortListener()
            controller.error(reason)
          }
          incoming.on('data', (chunk) => {
            if (bodyFinished) return
            controller.enqueue(new Uint8Array(chunk))
            if (controller.desiredSize !== null && controller.desiredSize <= 0) incoming.pause()
          })
          incoming.once('end', close)
          incoming.once('aborted', () => error(new Error('更新响应在下载完成前中断')))
          incoming.once('error', error)
        },
        pull() {
          incoming.resume()
        },
        cancel(reason) {
          if (!bodyFinished) {
            bodyFinished = true
            cleanupAbortListener()
            incoming.destroy(reason instanceof Error ? reason : undefined)
            try { request.abort() } catch { /* request may already be closed */ }
          }
        }
      })
      resolve({
        url: currentUrl,
        status: incoming.statusCode || 0,
        ok: (incoming.statusCode || 0) >= 200 && (incoming.statusCode || 0) < 300,
        headers: responseHeaders,
        body,
        async json() {
          const chunks = []
          for await (const chunk of body) chunks.push(Buffer.from(chunk))
          return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
        }
      })
    })

    request.on('error', (error) => {
      if (responseReceived) {
        if (!bodyFinished && bodyController) {
          bodyFinished = true
          cleanupAbortListener()
          try { bodyController.error(redirectError || error) } catch { /* stream already closed */ }
        }
        return
      }
      fail(redirectError || error)
    })

    abortListener = abortRequest
    options.signal?.addEventListener('abort', abortListener, { once: true })
    if (options.signal?.aborted) {
      abortRequest()
      return
    }
    try {
      request.end()
    } catch (error) {
      fail(error)
    }
  })
}

async function fetchWithSafeRedirects(url, options = {}) {
  const initialUrl = new URL(url).href
  const redirectMode = options.redirect || 'follow'
  let currentUrl = initialUrl
  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      ...options,
      credentials: 'omit',
      redirect: 'manual'
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    const location = response.headers?.get?.('location')
    if (!location) {
      await response.body?.cancel().catch(() => {})
      throw new Error('更新重定向缺少 Location')
    }
    if (redirectMode === 'error') {
      await response.body?.cancel().catch(() => {})
      throw new Error('更新请求不允许重定向')
    }
    if (redirectCount >= MAX_UPDATE_REDIRECTS) {
      await response.body?.cancel().catch(() => {})
      throw new Error('更新请求重定向次数超过上限')
    }

    const nextUrl = new URL(location, currentUrl).href
    assertAllowedUpdateRedirect(nextUrl, initialUrl, '更新重定向地址')
    await response.body?.cancel().catch(() => {})
    currentUrl = nextUrl
  }
}

async function httpFetch(url, options = {}) {
  const requestOptions = { ...options, credentials: 'omit' }
  if (net && typeof net.request === 'function') {
    return electronRequestFetch(url, requestOptions)
  }
  return fetchWithSafeRedirects(url, requestOptions)
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

const PUBLIC_RELEASE_ASSET_PATH =
  /^\/yuchen0x1\/Base64-encode-encoding\/releases\/(?:download\/v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)|latest\/download)\/[^/?#]+\.exe$/i

/**
 * GH-Proxy is only safe to use for the public installer asset whose URL was
 * already checked against the trusted GitHub release metadata. API, raw,
 * private, query-bearing, and unrelated GitHub URLs never enter the proxy.
 */
export function isPublicGitHubReleaseAssetUrl(value) {
  if (typeof value !== 'string' || value.trim() !== value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'github.com' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      !url.pathname.includes('%') &&
      PUBLIC_RELEASE_ASSET_PATH.test(url.pathname)
  } catch {
    return false
  }
}

export function getDownloadRoutes(value) {
  const routes = [{
    id: 'official',
    label: 'GitHub 官方线路',
    url: value
  }]
  if (isPublicGitHubReleaseAssetUrl(value)) {
    routes.push({
      id: 'gh-proxy',
      label: 'GH-Proxy 加速线路',
      url: `${GH_PROXY_BASE_URL}${value}`
    })
    routes.push({
      id: 'ghproxy-net',
      label: '备用 GitHub 加速线路',
      url: `${GH_PROXY_BACKUP_BASE_URL}${value}`
    })
  }
  return routes
}

export function measureSlowDownloadWindow({
  bytes,
  elapsedMs,
  slowWindows,
  transferredBytes,
  expectedSize
}) {
  const speed = Math.max(0, bytes) * 1000 / Math.max(1, elapsedMs)
  if (transferredBytes < UPDATE_DOWNLOAD_SLOW_MIN_BYTES ||
      (expectedSize > 0 && expectedSize < UPDATE_DOWNLOAD_SLOW_MIN_BYTES)) {
    return { speed, slowWindows: 0, shouldSwitch: false }
  }
  const nextSlowWindows = speed < UPDATE_DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SECOND
    ? slowWindows + 1
    : 0
  return {
    speed,
    slowWindows: nextSlowWindows,
    shouldSwitch: nextSlowWindows >= UPDATE_DOWNLOAD_SLOW_WINDOWS
  }
}

export function scoreDownloadRouteProbe({ bytes, elapsedMs }) {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 0
  }
  return bytes * 1000 / (elapsedMs + UPDATE_ROUTE_PROBE_LATENCY_WEIGHT_MS)
}

export function orderDownloadRoutesByProbeScore(routes, scores) {
  return routes
    .map((route, index) => ({ route, index, score: scores.get(route.id) }))
    .sort((left, right) => {
      const leftMeasured = Number.isFinite(left.score)
      const rightMeasured = Number.isFinite(right.score)
      if (leftMeasured !== rightMeasured) return leftMeasured ? -1 : 1
      if (leftMeasured && left.score !== right.score) return right.score - left.score
      return left.index - right.index
    })
    .map(({ route }) => route)
}

export function assertSecureUpdateUrl(value, label = '更新地址') {
  if (!isHttpUrl(value)) return true
  const protocol = new URL(value).protocol
  if (protocol === 'http:' && app.isPackaged) {
    throw new Error(`${label}必须使用 HTTPS；仅允许在开发环境显式开启 HTTP 更新源`)
  }
  return true
}

function isGitHubDownloadHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'github.com' ||
    host === 'githubusercontent.com' ||
    host.endsWith('.githubusercontent.com')
}

/**
 * Followed update redirects must stay within the expected publisher/service
 * boundary. GitHub release assets commonly redirect to a githubusercontent.com
 * CDN; GH-Proxy may redirect to either its own host or the same GitHub CDN.
 * Custom feeds are restricted to their original host.
 */
export function assertAllowedUpdateRedirect(value, expected, label = '更新重定向地址') {
  if (!isHttpUrl(value) || !isHttpUrl(expected)) {
    throw new Error(`${label}无效`)
  }
  assertSecureUpdateUrl(value, label)
  const target = new URL(value)
  const source = new URL(expected)
  const sourceHost = source.hostname.toLowerCase()
  const targetHost = target.hostname.toLowerCase()
  if (target.username || target.password || target.port !== source.port) {
    throw new Error(`${label}包含不允许的凭据或端口`)
  }
  const allowed = ALLOWED_PUBLIC_PROXY_HOSTS.has(sourceHost)
    ? targetHost === sourceHost || isGitHubDownloadHost(targetHost)
    : sourceHost === 'github.com' || sourceHost.endsWith('.github.com')
      ? isGitHubDownloadHost(targetHost)
      : targetHost === sourceHost
  if (!allowed) {
    throw new Error(`${label}不在允许的主机范围内`)
  }
  return true
}

async function readManifest(feed, expectedSha256) {
  let bytes
  let base
  if (isHttpUrl(feed)) {
    const manifestUrl = new URL(feed)
    assertSecureUpdateUrl(manifestUrl.href, '更新源')
    if (!/\.json$/i.test(manifestUrl.pathname)) {
      if (!manifestUrl.pathname.endsWith('/')) manifestUrl.pathname += '/'
      manifestUrl.pathname += 'version.json'
    }
    const res = await httpFetch(manifestUrl.href, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000)
    })
    if (res.url) assertAllowedUpdateRedirect(res.url, manifestUrl.href, '更新源重定向地址')
    if (!res.ok) throw new Error(`更新源返回 HTTP ${res.status}`)
    const chunks = []
    let size = 0
    if (!res.body) throw new Error('更新源未返回清单内容')
    for await (const chunk of res.body) {
      size += chunk.byteLength
      if (size > MAX_MANIFEST_BYTES) throw new Error('更新清单超过 64 KiB')
      chunks.push(chunk)
    }
    bytes = Buffer.concat(chunks, size)
    base = new URL('.', manifestUrl).href
  } else {
    const isManifestFile = path.extname(feed).toLowerCase() === '.json'
    base = isManifestFile ? path.dirname(feed) : feed
    const file = isManifestFile ? feed : path.join(feed, 'version.json')
    const handle = await fs.open(file, 'r')
    try {
      const buffer = Buffer.alloc(MAX_MANIFEST_BYTES + 1)
      const { bytesRead } = await handle.read(buffer)
      if (bytesRead > MAX_MANIFEST_BYTES) throw new Error('更新清单超过 64 KiB')
      bytes = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }
  if (expectedSha256 && crypto.createHash('sha256').update(bytes).digest('hex') !== expectedSha256) {
    throw new Error('更新清单与 GitHub Release SHA-256 不一致')
  }
  return { manifest: JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')), base }
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

function createDownloadCancelledError() {
  const error = new Error('更新包下载已取消')
  error.code = UPDATE_DOWNLOAD_CANCELLED
  return error
}

function assertDownloadNotCancelled(signal) {
  if (signal?.aborted) throw createDownloadCancelledError()
}

function assertDownloadSize(size) {
  if (Number.isFinite(size) && size > MAX_UPDATE_PACKAGE_BYTES) {
    throw new Error(`更新包超过大小上限（最大 ${MAX_UPDATE_PACKAGE_BYTES} 字节）`)
  }
}

function createDownloadSlowError(speed) {
  const error = new Error(`下载速度持续过低（约 ${Math.max(0, Math.floor(speed))} 字节/秒）`)
  error.code = UPDATE_DOWNLOAD_SLOW
  error.speed = speed
  return error
}

function parseContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(value || '').trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = match[3] === '*' ? 0 : Number(match[3])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start ||
      (total && (!Number.isSafeInteger(total) || end >= total))) return null
  return { start, end, total }
}

function createRangeMismatchError(contentRange, expectedStart, expectedTotal) {
  const error = new Error(`下载续传响应范围无效（期望 bytes=${expectedStart}-，实际 ${contentRange || '缺失 Content-Range'}）`)
  error.code = UPDATE_DOWNLOAD_RANGE_MISMATCH
  error.expectedStart = expectedStart
  error.expectedTotal = expectedTotal
  return error
}

async function probeDownloadRoute(route, expectedSize, signal) {
  const sampleBytes = Math.min(UPDATE_ROUTE_PROBE_BYTES, expectedSize)
  const controller = new AbortController()
  let timeoutId
  let abortFromCaller
  let reader
  const startedAt = performance.now()

  try {
    abortFromCaller = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    if (signal?.aborted) abortFromCaller()
    timeoutId = setTimeout(() => controller.abort(new Error('代理线路探测超时')), UPDATE_ROUTE_PROBE_TIMEOUT_MS)

    const response = await httpFetch(route.url, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      headers: { Range: `bytes=0-${sampleBytes - 1}` },
      signal: controller.signal
    })
    if (response?.url) assertAllowedUpdateRedirect(response.url, route.url, '代理探测重定向地址')
    const range = parseContentRange(response.headers?.get?.('content-range'))
    if (!response.ok || response.status !== 206 || !response.body ||
        !range || range.start !== 0 || range.end !== sampleBytes - 1 ||
        range.total !== expectedSize) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`${route.label}未返回匹配的 Range 探测响应`)
    }

    const contentLengthHeader = response.headers?.get?.('content-length')
    const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
    if (contentLength !== null && contentLength !== sampleBytes) {
      await response.body.cancel().catch(() => {})
      throw new Error(`${route.label}探测响应大小不匹配`)
    }

    reader = response.body.getReader()
    let received = 0
    for (;;) {
      assertDownloadNotCancelled(signal)
      const { done, value } = await reader.read()
      if (done) break
      if (!(value instanceof Uint8Array)) throw new Error(`${route.label}探测内容无效`)
      received += value.byteLength
      if (received > sampleBytes) throw new Error(`${route.label}探测响应超过请求范围`)
    }
    if (received !== sampleBytes) throw new Error(`${route.label}探测响应不完整`)
    const elapsedMs = performance.now() - startedAt
    return {
      route,
      bytes: received,
      elapsedMs,
      score: scoreDownloadRouteProbe({ bytes: received, elapsedMs })
    }
  } catch (error) {
    if (signal?.aborted) throw createDownloadCancelledError()
    if (controller.signal.aborted) throw new Error(`${route.label}线路探测超时`, { cause: error })
    throw error
  } finally {
    clearTimeout(timeoutId)
    if (signal && abortFromCaller) signal.removeEventListener('abort', abortFromCaller)
    if (reader) {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}

async function probeAndRankProxyRoutes(routes, expectedSize, signal, onRoute) {
  const proxies = routes.filter(route => route.id !== 'official')
  if (!Number.isSafeInteger(expectedSize) ||
      proxies.length === 0 ||
      expectedSize < UPDATE_ROUTE_PROBE_MIN_PACKAGE_BYTES) return proxies

  onRoute?.({ id: 'probe', label: '代理线路' })
  const results = await Promise.all(proxies.map(async route => {
    try {
      return await probeDownloadRoute(route, expectedSize, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      return { route, score: null }
    }
  }))
  const scores = new Map(results
    .filter(result => Number.isFinite(result.score) && result.score > 0)
    .map(result => [result.route.id, result.score]))
  return orderDownloadRoutesByProbeScore(proxies, scores)
}

async function downloadHttpTo(
  url,
  dest,
  expectedSize,
  onProgress,
  attempts = 3,
  signal,
  { allowResume = true } = {}
) {
  const declaredSize = Number(expectedSize)
  assertDownloadSize(declaredSize)
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let start = 0
    assertDownloadNotCancelled(signal)
    const requestController = new AbortController()
    let timeoutId
    let externalAbort
    let responseBody
    const armTimeout = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => requestController.abort(), UPDATE_DOWNLOAD_IDLE_TIMEOUT_MS)
    }
    try {
      const existing = await fs.stat(dest).catch(() => null)
      const canResume = allowResume || attempt > 1
      if (canResume && existing?.isFile() && existing.size > 0 && (!declaredSize || existing.size < declaredSize)) {
        start = existing.size
      }
      assertDownloadSize(start)

      const headers = start ? { Range: `bytes=${start}-` } : undefined
      externalAbort = () => requestController.abort()
      signal?.addEventListener('abort', externalAbort, { once: true })
      armTimeout()
      const res = await httpFetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        headers,
        signal: requestController.signal
      })
      responseBody = res?.body
      if (res?.url) assertAllowedUpdateRedirect(res.url, url, '更新包重定向地址')
      if (!res?.ok) throw new Error(`下载更新包失败：HTTP ${res?.status ?? '未知状态'}`)
      if (!res.body || typeof res.body.getReader !== 'function') {
        throw new Error('下载更新包失败：HTTP 响应缺少内容流')
      }

      const contentRange = res.headers?.get?.('content-range') || ''
      const parsedRange = parseContentRange(contentRange)
      const resumed = start > 0 && res.status === 206
      if (start > 0 && resumed && (!parsedRange || parsedRange.start !== start ||
          parsedRange.total <= 0 || (declaredSize > 0 && parsedRange.total !== declaredSize))) {
        await res.body.cancel().catch(() => {})
        await fs.truncate(dest, 0)
        throw createRangeMismatchError(contentRange, start, declaredSize)
      }
      if (start === 0 && res.status === 206) {
        await res.body.cancel().catch(() => {})
        throw createRangeMismatchError(contentRange, 0, declaredSize)
      }
      if (start > 0 && !resumed) {
        start = 0
        await fs.truncate(dest, 0)
      }

      const contentLength = Number(res.headers?.get?.('content-length'))
      const rangeTotal = parsedRange?.total || 0
      assertDownloadSize(contentLength)
      assertDownloadSize(rangeTotal)
      const total = rangeTotal || (Number.isFinite(declaredSize) && declaredSize > 0
        ? declaredSize
        : Number.isFinite(contentLength) && contentLength > 0
          ? start + contentLength
          : 0)
      assertDownloadSize(total)
      const handle = await fs.open(dest, start ? 'r+' : 'w')
      const reader = res.body.getReader()
      let received = start
      let lastReport = 0
      let speedWindowStartedAt = Date.now()
      let speedWindowBytes = 0
      let slowWindows = 0
      try {
        for (;;) {
          assertDownloadNotCancelled(signal)
          armTimeout()
          const { done, value } = await reader.read()
          if (done) break
          if (!(value instanceof Uint8Array)) throw new Error('下载更新包失败：内容流返回了无效数据')
          await writeAll(handle, value, received)
          received += value.byteLength
          assertDownloadSize(received)
          speedWindowBytes += value.byteLength
          const now = Date.now()
          if (now - lastReport > 120) {
            lastReport = now
            onProgress(
              total ? received / total : 0,
              speedWindowBytes * 1000 / Math.max(1, now - speedWindowStartedAt)
            )
          }
          const windowElapsed = now - speedWindowStartedAt
          const measuredBytes = received - start
          if (windowElapsed >= UPDATE_DOWNLOAD_SLOW_WINDOW_MS &&
              measuredBytes >= UPDATE_DOWNLOAD_SLOW_MIN_BYTES &&
              (declaredSize <= 0 || declaredSize >= UPDATE_DOWNLOAD_SLOW_MIN_BYTES)) {
            const window = measureSlowDownloadWindow({
              bytes: speedWindowBytes,
              elapsedMs: windowElapsed,
              slowWindows,
              transferredBytes: measuredBytes,
              expectedSize: declaredSize
            })
            slowWindows = window.slowWindows
            speedWindowStartedAt = now
            speedWindowBytes = 0
            const reachedExpectedEnd =
              (declaredSize > 0 && received >= declaredSize) ||
              (total > 0 && received >= total)
            if (window.shouldSwitch && !reachedExpectedEnd) {
              await reader.cancel().catch(() => {})
              throw createDownloadSlowError(window.speed)
            }
          }
        }
      } finally {
        reader.releaseLock()
        await handle.close()
      }

      if (received === 0) throw new Error('下载更新包失败：响应内容为空')
      if (resumed && received - start !== parsedRange.end - parsedRange.start + 1) {
        throw createRangeMismatchError(contentRange, start, declaredSize)
      }
      if (declaredSize > 0 && received !== declaredSize) {
        throw new Error(`下载更新包大小不匹配（期望 ${declaredSize} 字节，实际 ${received} 字节）`)
      }
      onProgress(1)
      return received
    } catch (error) {
      if (signal?.aborted) throw createDownloadCancelledError()
      if (error?.code === UPDATE_DOWNLOAD_SLOW) throw error
      if (error?.code === UPDATE_DOWNLOAD_RANGE_MISMATCH) {
        await fs.truncate(dest, 0).catch(() => {})
      }
      if (requestController.signal.aborted) {
        lastError = new Error(`下载更新包超时（${UPDATE_DOWNLOAD_IDLE_TIMEOUT_MS} 毫秒无响应）`)
      } else {
        lastError = error
      }
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 700))
      }
    } finally {
      clearTimeout(timeoutId)
      if (signal && externalAbort) signal.removeEventListener('abort', externalAbort)
      // Validation can fail before a reader exists; release that HTTP response too.
      await responseBody?.cancel().catch(() => {})
    }
  }

  throw new Error(`下载更新包失败（已重试 ${attempts} 次）：${lastError?.message || '未知错误'}`, { cause: lastError })
}

async function downloadRoutedTo(routes, dest, expectedSize, onProgress, signal, onRoute) {
  const declaredSize = Number(expectedSize)
  const orderedRoutes = routes.length ? [routes[0]] : []
  let proxiesRanked = false
  let lastError
  for (let index = 0; index < orderedRoutes.length; index += 1) {
    const route = orderedRoutes[index]
    assertDownloadNotCancelled(signal)
    if (index > 0) {
      // Never resume bytes received from a different download service.
      await fs.rm(dest, { force: true })
    }
    onRoute?.(route)
    try {
      return await downloadHttpTo(
        route.url,
        dest,
        expectedSize,
        onProgress,
        3,
        signal,
        { allowResume: index === 0 }
      )
    } catch (error) {
      if (signal?.aborted) throw createDownloadCancelledError()
      lastError = error
      if (index === 0 && !proxiesRanked && routes.length > 1) {
        proxiesRanked = true
        orderedRoutes.push(...await probeAndRankProxyRoutes(routes, declaredSize, signal, onRoute))
      }
      if (index + 1 < orderedRoutes.length) {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }
  }
  throw lastError || new Error('下载更新包失败：没有可用的下载线路')
}

async function downloadTo(url, dest, expectedSize, onProgress, signal, options = {}) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const declaredSize = Number(expectedSize)
  assertDownloadSize(declaredSize)
  if (isHttpUrl(url)) {
    return downloadRoutedTo(getDownloadRoutes(url), dest, expectedSize, onProgress, signal, options.onRoute)
  }

  const handle = await fs.open(dest, 'w')
  try {
    const stat = await fs.stat(url)
    assertDownloadSize(stat.size)
    const total = stat.size || 1
    const buffer = Buffer.alloc(256 * 1024)
    const source = await fs.open(url, 'r')
    let received = 0
    try {
      for (;;) {
        assertDownloadNotCancelled(signal)
        const { bytesRead } = await source.read(buffer, 0, buffer.length, received)
        if (!bytesRead) break
        await writeAll(handle, buffer.subarray(0, bytesRead), received)
        received += bytesRead
        assertDownloadSize(received)
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

export function checkForUpdates() {
  if (checkPromise) return checkPromise
  if (state.downloading || state.installing) return Promise.reject(new Error('更新任务正在进行'))
  checkPromise = checkForUpdatesImpl().finally(() => { checkPromise = null })
  return checkPromise
}

function isReleaseApiRateLimited(error) {
  return error?.code === 'ERR_GITHUB_RELEASE_HTTP' && (error.status === 403 || error.status === 429)
}

async function readPackagedUpdate(feed, currentVersion) {
  let release
  try {
    release = await fetchLatestRelease(httpFetch)
  } catch (error) {
    if (!isReleaseApiRateLimited(error) || feed !== DEFAULT_UPDATE_FEED) throw error
    return readManifest(DEFAULT_UPDATE_FEED)
  }
  const version = release.tag_name.slice(1)
  if (!isNewerVersion(version, currentVersion)) return { manifest: { version } }
  const manifestAsset = getReleaseAsset(release, 'version.json')
  const installer = getReleaseAsset(release, `GeekToolbox-Setup-${version}.exe`)
  const official = await readManifest(manifestAsset.url, manifestAsset.sha256)
  const { manifest, base } = official
  const packageInfo = resolvePackage(manifest, base)
  if (normalizeVersion(manifest.version) !== version || packageInfo.url !== installer.url ||
      packageInfo.sha256?.toLowerCase() !== installer.sha256 || packageInfo.size !== installer.size) {
    throw new Error('Windows 清单与 GitHub Release 安装包记录不一致')
  }
  if (feed === DEFAULT_UPDATE_FEED) return official

  const mirror = await readManifest(feed)
  const mirrorPackage = resolvePackage(mirror.manifest, mirror.base)
  if (normalizeVersion(mirror.manifest.version) !== version ||
      mirrorPackage.sha256?.toLowerCase() !== installer.sha256 || mirrorPackage.size !== installer.size) {
    throw new Error('备用更新源与 GitHub Release 安装包记录不一致')
  }
  assertSupportedInstallerPackage(mirrorPackage, mirror.manifest.kind)
  return { manifest: { ...manifest, package: { ...manifest.package, url: mirrorPackage.url } }, base: mirror.base }
}

async function checkForUpdatesImpl() {
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
      portable: isPortableRuntime()
    }
  }

  const feed = resolveFeed()

  let manifest
  let base
  try {
    assertSecureUpdateUrl(feed, '更新源')
    const result = app.isPackaged
      ? await readPackagedUpdate(feed, currentVersion)
      : await readManifest(feed)
    manifest = result.manifest
    base = result.base
  } catch (error) {
    throw new Error(`${error.message}（更新源：${feed}）`, { cause: error })
  }

  if (!manifest || !manifest.version) throw new Error('更新清单缺少 version 字段')

  const latestVersion = normalizeVersion(manifest.version)
  if (!latestVersion) throw new Error('更新清单 version 字段无效')
  const kind = manifest.kind || ''
  const hasUpdate = isNewerVersion(latestVersion, currentVersion)

  if (hasUpdate) {
    const pkg = resolvePackage(manifest, base)
    if (pkg.kind === 'http') assertSecureUpdateUrl(pkg.url, '更新包地址')
    assertSupportedInstallerPackage(pkg, kind)
    if (manifest.platform !== undefined && manifest.platform !== process.platform) throw new Error('更新包平台不兼容')
    if (manifest.arch !== undefined && manifest.arch !== process.arch) throw new Error('更新包架构不兼容')
    state.packageInfo = pkg
    state.manifestKind = kind
    state.latest = {
      version: latestVersion,
      buildTime: manifest.buildTime || null,
      notes: Array.isArray(manifest.notes) ? manifest.notes : [],
      releaseDate: manifest.releaseDate || null,
      size: pkg.size || null,
      force: Boolean(manifest.force),
      signed: Boolean(pkg.signature),
      detailsUrl: `${RELEASES_URL}/tag/v${latestVersion}`
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
  if (state.downloading || state.installing || checkPromise) throw new Error('更新任务正在进行')

  const pkg = state.packageInfo
  if (!pkg) throw new Error('更新包信息缺失，请重新检查更新')
  assertSupportedInstallerPackage(pkg, state.manifestKind)

  state.downloading = true
  state.downloadController = new AbortController()
  let dest = ''
  let partialDest = ''
  try {
    const baseDir = path.join(app.getPath('userData'), 'updates')
    dest = path.join(baseDir, installerFileName(pkg, state.latest.version))
    partialDest = `${dest}.download`
    await fs.mkdir(baseDir, { recursive: true })
    await fs.rm(dest, { force: true })
    await fs.rm(partialDest, { force: true })
    state.installerFile = ''
    if (Number.isSafeInteger(pkg.size) && pkg.size > 0) {
      const { bavail, bsize } = await fs.statfs(baseDir)
      if (bavail * bsize < pkg.size) throw new Error('磁盘空间不足，无法下载安装包')
    }

    sendProgress(1, '正在下载安装包…')
    const started = Date.now()
    let activeRoute = pkg.kind === 'http'
      ? getDownloadRoutes(pkg.url)[0]
      : { label: '本地更新源' }
    const received = await downloadTo(pkg.url, partialDest, pkg.size, (ratio, measuredSpeed) => {
      const bytesPerSecond = measuredSpeed > 0
        ? Math.floor(measuredSpeed)
        : Math.floor((pkg.size || 0) * ratio * 1000 / Math.max(1000, Date.now() - started))
      sendProgress(
        2 + ratio * 86,
        `正在通过${activeRoute.label}下载安装包… ${Math.round(ratio * 100)}%`,
        bytesPerSecond
      )
    }, state.downloadController.signal, {
      onRoute: (route) => {
        activeRoute = route
        const message = route.id === 'probe'
          ? '官方线路不稳定，正在探测备用线路速度…'
          : route.id === 'official'
          ? `正在通过${route.label}下载安装包…`
          : route.id === 'gh-proxy'
            ? `官方线路不稳定，正在切换至${route.label}…`
            : `GH-Proxy 不可用，正在尝试${route.label}…`
        sendProgress(2, message)
      }
    })

    sendProgress(90, '正在校验安装包…')
    const actual = await hashFile(partialDest)
    if (actual.toLowerCase() !== pkg.sha256.toLowerCase()) {
      throw new Error(`安装包校验失败（期望 ${pkg.sha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
    }

    state.signature = await verifyAuthenticodeSignature(partialDest, pkg.signature)
    assertDownloadNotCancelled(state.downloadController.signal)

    await fs.rename(partialDest, dest)
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
    if (partialDest) await fs.rm(partialDest, { force: true }).catch(() => {})
    throw error
  } finally {
    state.downloading = false
    state.downloadController = null
  }
}

export function cancelDownloadUpdate() {
  if (!state.downloading || !state.downloadController) return { ok: false, cancelled: false }
  state.downloadController.abort()
  return { ok: true, cancelled: true }
}

export async function installUpdate() {
  if (state.installing) throw new Error('更新安装已经开始，请勿重复操作')
  if (state.downloading || checkPromise) throw new Error('更新任务正在进行')
  state.installing = true
  try { return await installUpdateImpl() }
  catch (error) { state.installing = false; throw error }
}

async function prepareRollback(workDir, version) {
  if (!app.isPackaged) return []
  const installer = path.join(workDir, 'rollback-installer.exe')
  try {
    await fs.rm(installer, { force: true })
    const release = await fetchReleaseByVersion(version, httpFetch)
    const asset = getReleaseAsset(release, `GeekToolbox-Setup-${version}.exe`)
    const { bavail, bsize } = await fs.statfs(workDir)
    if (bavail * bsize < asset.size * 2) throw new Error('磁盘剩余空间不足')
    sendProgress(96, '正在准备可验证的旧版安装包，以便安装失败时恢复…')
    await downloadHttpTo(asset.url, installer, asset.size, () => {}, 1, AbortSignal.timeout(45_000))
    if (await hashFile(installer) !== asset.sha256) throw new Error('旧版安装包 SHA-256 不匹配')
    return ['--rollback-installer', installer, '--rollback-sha256', asset.sha256, '--previous-version', version]
  } catch (error) {
    await fs.rm(installer, { force: true }).catch(() => {})
    console.warn('[updater] 未能准备旧版安装包，将使用交互式修复：', JSON.stringify(error.message))
    return []
  }
}

async function installUpdateImpl() {
  if (process.platform !== 'win32') throw new Error('Electron 自动更新仅支持 Windows NSIS 安装包')
  assertSupportedInstallerPackage(state.packageInfo, state.manifestKind)
  if (!state.latest?.version) throw new Error('更新目标版本缺失，请重新检查更新')
  if (!state.installerFile || !existsSync(state.installerFile)) {
    throw new Error('安装包尚未下载完成，请重新检查更新')
  }
  if (await hashFile(state.installerFile) !== state.packageInfo.sha256.toLowerCase()) {
    throw new Error('安装包在下载后发生变化，请重新检查并下载更新')
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
  const rollbackArgs = await prepareRollback(runtimeDir, normalizeVersion(app.getVersion()))

  sendProgress(97, '正在验证更新助手能否启动…')

  try {
    await startInstallerHelper(
      runtimeCopy,
      [
        tempScript,
        '--pid', String(process.pid),
        '--installer', state.installerFile,
        '--sha256', state.packageInfo.sha256.toLowerCase(),
        ...rollbackArgs,
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
    if (rollbackArgs.length) await fs.rm(rollbackArgs[1], { force: true }).catch(() => {})
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
    platform: process.platform,
    signature: state.signature,
    portable: isPortableRuntime()
  }
}

export function registerUpdaterIpc(ipcMain, { getMainWindow } = {}) {
  if (typeof getMainWindow !== 'function') throw new TypeError('registerUpdaterIpc 需要主窗口访问函数')
  mainWindowProvider = getMainWindow
  return registerTrustedIpcHandlers(ipcMain, {
    'update:info': () => getUpdateInfo(),
    'update:check': () => checkForUpdates(),
    'update:download': () => downloadUpdate(),
    'update:cancel': () => cancelDownloadUpdate(),
    'update:install': () => installUpdate()
  }, {
    getMainWindow,
    isPackaged: app.isPackaged,
    indexFile: path.join(__dirname, '..', 'dist', 'index.html'),
    devServerUrl: 'http://localhost:5173'
  })
}

/** Abort in-flight network work when the window or application goes away. */
export function shutdownUpdater() {
  if (startupCheckTimer) {
    clearTimeout(startupCheckTimer)
    startupCheckTimer = null
  }
  state.downloadController?.abort()
  clearPendingEvent()
}

/** 启动后自动检查一次，发现新版本立即推送事件让渲染进程弹窗 */
export function scheduleStartupCheck(delay = 4000) {
  if (startupCheckTimer) clearTimeout(startupCheckTimer)
  startupCheckTimer = setTimeout(async () => {
    startupCheckTimer = null
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
      console.warn('[updater] 启动检查跳过:', JSON.stringify(error.message))
    }
  }, delay)
}
