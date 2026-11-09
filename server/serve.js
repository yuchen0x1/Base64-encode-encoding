#!/usr/bin/env node
/**
 * 极客工具箱 · 网页版本地服务器（零依赖）
 *
 * 能力：
 *  - 静态托管 dist/（SPA 回退、哈希资源长缓存、version.json 不缓存）
 *  - GET  /api/version           当前运行版本
 *  - GET  /api/update/check      读取更新源清单并与当前版本比较
 *  - POST /api/update/apply      下载更新包 → SHA-256 校验 → 解压 → 目录换位 → 进程自重启
 *  - GET  /api/update/progress   更新任务进度（前端轮询）
 *
 * 用法：
 *  npm run serve                # 默认 127.0.0.1:4173，更新源 updates/web
 *  node server/serve.js --port 8080 --host 0.0.0.0 --feed https://example.com/updates/web
 *
 * 环境变量：PORT / HOST / TOOLBOX_WEB_ROOT / TOOLBOX_WEB_FEED / TOOLBOX_ALLOW_REMOTE_UPDATE=1
 */
import http from 'node:http'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { extractZip } from '../shared/zip.js'
import { isNewerVersion, normalizeVersion } from '../shared/version.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv) {
  const args = { port: 4173, host: '127.0.0.1', root: '', feed: '' }
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i]
    const value = argv[i + 1]
    if (key === '--port') { args.port = Number(value); i += 1 }
    else if (key === '--host') { args.host = value; i += 1 }
    else if (key === '--root') { args.root = value; i += 1 }
    else if (key === '--feed') { args.feed = value; i += 1 }
    else if (key === '--allow-remote-update') { args.allowRemoteUpdate = true }
    else if (key === '--help' || key === '-h') { args.help = true }
  }
  return args
}

const args = parseArgs(process.argv)
if (args.help) {
  console.log(`
极客工具箱网页版服务器
  --port <n>                 监听端口（默认 4173）
  --host <addr>              监听地址（默认 127.0.0.1；局域网共享用 0.0.0.0）
  --root <dir>               静态目录（默认 ./dist）
  --feed <dir|url>           更新源目录或 URL（默认 ./updates/web）
  --allow-remote-update      允许非本机请求触发更新（默认仅回环地址）
`)
  process.exit(0)
}

const ROOT = path.resolve(args.root || process.env.TOOLBOX_WEB_ROOT || path.join(__dirname, '..', 'dist'))
const FEED = args.feed || process.env.TOOLBOX_WEB_FEED || path.join(__dirname, '..', 'updates', 'web')
const PORT = Number(process.env.PORT || args.port)
const HOST = process.env.HOST || args.host
const ALLOW_REMOTE_UPDATE = args.allowRemoteUpdate || process.env.TOOLBOX_ALLOW_REMOTE_UPDATE === '1'
const LOG_FILE = path.join(__dirname, '..', 'updates', 'web-update.log')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip'
}

const job = {
  id: null,
  status: 'idle',
  percent: 0,
  message: '',
  error: '',
  fromVersion: '',
  toVersion: '',
  startedAt: 0,
  finishedAt: 0
}
let jobRunning = false

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  })
  res.end(body)
}

async function readJson(file) {
  const raw = await fs.readFile(file, 'utf8')
  return JSON.parse(raw.replace(/^\uFEFF/, ''))
}

async function readJsonSafe(file) {
  try {
    return await readJson(file)
  } catch {
    return null
  }
}

async function getCurrentManifest() {
  return readJsonSafe(path.join(ROOT, 'version.json'))
}

async function readFeedManifest() {
  if (/^https?:\/\//i.test(FEED)) {
    const url = FEED.endsWith('.json') ? FEED : `${FEED.replace(/\/$/, '')}/version.json`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`更新源返回 HTTP ${res.status}`)
    return { manifest: await res.json(), base: url.replace(/\/version\.json.*$/i, '') }
  }
  const dir = FEED.endsWith('.json') ? path.dirname(FEED) : FEED
  const file = FEED.endsWith('.json') ? FEED : path.join(FEED, 'version.json')
  const manifest = await readJson(file)
  return { manifest, base: dir }
}

function resolvePackage(manifest, base) {
  const info = manifest.package || {}
  const url = info.url || `geek-toolbox-web-${manifest.version}.zip`
  if (/^https?:\/\//i.test(url)) return { ...info, url, kind: 'http' }
  const abs = path.isAbsolute(url) ? url : path.join(base, url)
  return { ...info, url: abs, kind: 'file' }
}

async function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    await fs.mkdir(path.dirname(LOG_FILE), { recursive: true })
    await fs.appendFile(LOG_FILE, line, 'utf8')
  } catch { /* 日志失败不影响主流程 */ }
  process.stdout.write(line)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function setJob(patch) {
  Object.assign(job, patch)
}

async function downloadPackage(pkgInfo, onProgress) {
  if (pkgInfo.kind === 'http') {
    const res = await fetch(pkgInfo.url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`下载更新包失败：HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length') || pkgInfo.size || 0)
    const reader = res.body.getReader()
    const chunks = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
      received += value.length
      if (total) onProgress(received / total)
    }
    return Buffer.concat(chunks)
  }

  const stat = await fs.stat(pkgInfo.url)
  const total = stat.size || 1
  const handle = await fs.open(pkgInfo.url, 'r')
  const chunks = []
  let received = 0
  try {
    const buffer = Buffer.alloc(256 * 1024)
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, received)
      if (!bytesRead) break
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)))
      received += bytesRead
      onProgress(received / total)
    }
  } finally {
    await handle.close()
  }
  return Buffer.concat(chunks)
}

async function renameWithRetry(from, to, attempts = 4) {
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.rename(from, to)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
  }
  throw lastError
}

async function copyFileWithRetry(from, to, attempts = 4) {
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fs.copyFile(from, to)
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw lastError
}

/**
 * 删除暂存目录。
 * Windows 上 fs.rm(recursive) 可能被杀毒/索引服务或宿主安全策略拦截而整体失败，
 * 这里退化为逐文件删除，避免残留 .next-* 目录堆积。
 */
async function removeDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true })
    return
  } catch {
    /* 回退逐文件删除 */
  }
  async function walk(current) {
    let items
    try {
      items = await fs.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      const target = path.join(current, item.name)
      if (item.isDirectory()) await walk(target)
      else await fs.unlink(target).catch(() => {})
    }
    await fs.rmdir(current).catch(() => {})
  }
  await walk(dir)
}

/**
 * Windows 下目录可能被杀毒/索引服务短暂占用，导致整目录 rename 失败（EPERM）。
 * 此时退化为逐文件覆盖：先写资源，再写入口文件，任何失败都回滚入口文件，
 * 保证旧版本页面始终可用。
 */
async function replaceInPlace(staging, root) {
  const entryFiles = new Set(['index.html', 'version.json'])
  const oldIndex = await fs.readFile(path.join(root, 'index.html'))
  const oldVersion = await fs.readFile(path.join(root, 'version.json')).catch(() => null)

  async function walk(from, to) {
    const items = await fs.readdir(from, { withFileTypes: true })
    await fs.mkdir(to, { recursive: true })
    for (const item of items) {
      if (item.isFile() && entryFiles.has(item.name)) continue
      const src = path.join(from, item.name)
      const dest = path.join(to, item.name)
      if (item.isDirectory()) await walk(src, dest)
      else if (item.isFile()) await copyFileWithRetry(src, dest)
    }
  }

  try {
    await walk(staging, root)
    await copyFileWithRetry(path.join(staging, 'index.html'), path.join(root, 'index.html'))
    if (oldVersion) {
      await copyFileWithRetry(path.join(staging, 'version.json'), path.join(root, 'version.json'))
    }
  } catch (error) {
    await fs.writeFile(path.join(root, 'index.html'), oldIndex).catch(() => {})
    if (oldVersion) await fs.writeFile(path.join(root, 'version.json'), oldVersion).catch(() => {})
    throw new Error(`逐文件覆盖失败，已回滚入口文件：${error.message}`)
  }
}

async function applyUpdate(jobId) {
  const startedAt = Date.now()
  setJob({ id: jobId, status: 'preparing', percent: 1, message: '读取更新清单…', error: '', startedAt, finishedAt: 0 })

  const current = await getCurrentManifest()
  const { manifest, base } = await readFeedManifest()
  const latestVersion = normalizeVersion(manifest.version)
  const currentVersion = normalizeVersion(current?.version || '0.0.0')

  if (!isNewerVersion(latestVersion, currentVersion)) {
    throw new Error('当前已是最新版本，无需更新')
  }

  setJob({ toVersion: latestVersion, fromVersion: currentVersion })
  await log(`开始更新 ${currentVersion} -> ${latestVersion}`)

  const pkgInfo = resolvePackage(manifest, base)
  setJob({ status: 'downloading', percent: 5, message: '正在下载更新包…' })
  const buffer = await downloadPackage(pkgInfo, (ratio) => {
    setJob({ percent: Math.min(70, 5 + Math.round(ratio * 65)), message: `正在下载更新包… ${Math.round(ratio * 100)}%` })
  })
  await log(`更新包下载完成，${(buffer.length / 1024).toFixed(1)} KB`)

  setJob({ status: 'verifying', percent: 72, message: '正在校验完整性…' })
  if (pkgInfo.sha256) {
    const actual = sha256(buffer)
    if (actual.toLowerCase() !== String(pkgInfo.sha256).toLowerCase()) {
      throw new Error(`更新包校验失败（期望 ${pkgInfo.sha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
    }
  } else {
    await log('警告：更新清单未提供 sha256，已跳过完整性校验')
  }

  setJob({ status: 'extracting', percent: 78, message: '正在解压更新包…' })
  const staging = `${ROOT}.next-${startedAt}`
  await removeDir(staging)
  await extractZip(buffer, staging)

  const hasIndex = existsSync(path.join(staging, 'index.html'))
  const hasVersion = existsSync(path.join(staging, 'version.json'))
  if (!hasIndex || !hasVersion) {
    await removeDir(staging)
    throw new Error('更新包结构异常：缺少 index.html 或 version.json')
  }

  setJob({ status: 'swapping', percent: 88, message: '正在替换应用文件…' })
  const backup = `${ROOT}.old-${startedAt}`
  let mode = 'rename'

  try {
    await renameWithRetry(ROOT, backup)
  } catch (renameError) {
    await log(`目录换位不可用（${renameError.code || renameError.message}），改用逐文件覆盖`)
    mode = 'copy'
    await replaceInPlace(staging, ROOT)
    await removeDir(staging)
  }

  if (mode === 'rename') {
    try {
      await renameWithRetry(staging, ROOT)
    } catch (error) {
      await renameWithRetry(backup, ROOT).catch(() => {})
      throw new Error(`替换文件失败，已回滚：${error.message}`)
    }
    removeDir(backup).catch(() => {})
  }

  setJob({ status: 'restarting', percent: 96, message: '正在重启服务器…' })
  await log(`文件替换完成（${mode === 'rename' ? '目录换位' : '逐文件覆盖'}）`)

  setJob({ status: 'done', percent: 100, message: '更新完成，服务器正在重启…', finishedAt: Date.now() })
  await log('更新完成，准备重启进程')
  scheduleRestart()
}

function scheduleRestart() {
  const childArgs = process.argv.slice(1)
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, TOOLBOX_RESTARTED: '1' }
  })
  child.unref()
  setTimeout(() => process.exit(0), 600)
}

async function handleApi(req, res, url) {
  const pathname = url.pathname

  if (pathname === '/api/version') {
    const manifest = await getCurrentManifest()
    return sendJson(res, 200, {
      version: manifest?.version || '0.0.0',
      buildTime: manifest?.buildTime || null,
      mode: 'server'
    })
  }

  if (pathname === '/api/update/check') {
    const current = await getCurrentManifest()
    const currentVersion = normalizeVersion(current?.version || '0.0.0')
    try {
      const { manifest, base } = await readFeedManifest()
      const latestVersion = normalizeVersion(manifest.version)
      const pkgInfo = resolvePackage(manifest, base)
      const hasUpdate = isNewerVersion(latestVersion, currentVersion)
      return sendJson(res, 200, {
        mode: 'server',
        supported: true,
        hasUpdate,
        currentVersion,
        latest: hasUpdate
          ? {
              version: latestVersion,
              buildTime: manifest.buildTime || null,
              notes: Array.isArray(manifest.notes) ? manifest.notes : [],
              size: pkgInfo.size || null,
              force: Boolean(manifest.force)
            }
          : null
      })
    } catch (error) {
      return sendJson(res, 502, {
        mode: 'server',
        supported: true,
        hasUpdate: false,
        currentVersion,
        error: `无法读取更新源：${error.message}`
      })
    }
  }

  if (pathname === '/api/update/apply') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '仅支持 POST' })
    if (jobRunning) return sendJson(res, 409, { error: '已有更新任务在进行中', job })

    const remote = req.socket.remoteAddress || ''
    const isLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
    if (!isLoopback && !ALLOW_REMOTE_UPDATE) {
      return sendJson(res, 403, { error: '远程更新已被禁用，请在服务器本机操作或启动时加 --allow-remote-update' })
    }

    jobRunning = true
    const jobId = String(Date.now())
    setJob({ ...job, id: jobId, status: 'preparing', percent: 0, message: '准备更新…', error: '' })
    sendJson(res, 202, { jobId, status: job.status })

    applyUpdate(jobId)
      .catch(async (error) => {
        setJob({ status: 'error', percent: 0, message: '更新失败', error: error.message, finishedAt: Date.now() })
        await log(`更新失败：${error.stack || error.message}`)
      })
      .finally(() => {
        jobRunning = false
      })
    return undefined
  }

  if (pathname === '/api/update/progress') {
    return sendJson(res, 200, { ...job })
  }

  return sendJson(res, 404, { error: '未知 API' })
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'

  const resolved = path.resolve(ROOT, `.${pathname}`)
  if (!resolved.startsWith(path.resolve(ROOT) + path.sep) && resolved !== path.resolve(ROOT)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  let filePath = resolved
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    if (!path.extname(pathname)) filePath = path.join(ROOT, 'index.html')
  }

  try {
    const data = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const name = path.basename(filePath)
    const noCache = name === 'index.html' || name === 'version.json' || name === 'manifest.json'
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-store, no-cache, must-revalidate' : 'public, max-age=31536000, immutable',
      'Content-Length': data.length
    })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 Not Found')
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((error) => sendJson(res, 500, { error: error.message }))
    return
  }
  serveStatic(req, res, url).catch(() => {
    res.writeHead(500).end('Internal Server Error')
  })
})

function start(attempt = 0) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attempt < 12) {
      // 自重启时旧进程尚未释放端口，短暂重试
      setTimeout(() => start(attempt + 1), 400)
      return
    }
    console.error('[server] 启动失败:', error.message)
    process.exit(1)
  })
  server.listen(PORT, HOST, () => {
    const version = existsSync(path.join(ROOT, 'version.json')) ? '' : '（警告：dist/version.json 不存在，请先 npm run build）'
    console.log(`
  极客工具箱 · 网页服务器已启动
  地址:   http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/
  根目录: ${ROOT}
  更新源: ${FEED}
  模式:   ${ALLOW_REMOTE_UPDATE ? '允许远程更新' : '仅本机可触发更新'} ${version}
`)
  })
}

start()
