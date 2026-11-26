import assert from 'node:assert/strict'

const [portText, expectedVersion, timeoutText = '45000'] = process.argv.slice(2)
const port = Number(portText)
const timeoutMs = Number(timeoutText)
const startupOnly = expectedVersion === '--startup'

assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'A valid CDP port is required.')
if (!startupOnly) assert.match(expectedVersion || '', /^\d+\.\d+\.\d+$/, 'A stable target version is required.')
assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0, 'A positive timeout is required.')

const endpoint = `http://127.0.0.1:${port}/json/list`

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function findPage() {
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`CDP endpoint returned HTTP ${response.status}`)
  const pages = await response.json()
  return pages.find(page => page?.type === 'page' && typeof page.webSocketDebuggerUrl === 'string') || null
}

function connectDebugger(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('Timed out connecting to the renderer CDP socket.'))
    }, 5000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve(socket)
    }, { once: true })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('Could not connect to the renderer CDP socket.'))
    }, { once: true })
  })
}

function createCdpClient(socket) {
  let nextId = 0
  const pending = new Map()
  const onMessage = event => {
    let message
    try {
      message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'))
    } catch {
      return
    }
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message || 'CDP command failed'))
    else request.resolve(message.result)
  }
  socket.addEventListener('message', onMessage)

  function send(method, params = {}) {
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`Timed out waiting for ${method}.`))
      }, 5000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  function close() {
    socket.removeEventListener('message', onMessage)
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('CDP socket closed'))
    }
    pending.clear()
    socket.close()
  }

  return { send, close }
}

async function readUpdateUi(client) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const backdrop = document.querySelector('.upd-backdrop')
      const status = document.querySelector('.upd-status')
      const version = document.querySelector('.upd-version-row')
      return {
        ready: document.readyState === 'complete' && Boolean(document.querySelector('.brand-title')) && Boolean(document.querySelector('.locale-picker select')),
        open: Boolean(backdrop),
        status: status?.textContent?.trim() || '',
        version: version?.textContent?.trim() || '',
        title: document.title
      }
    })()`,
    returnByValue: true
  })
  return result?.result?.value || null
}

const deadline = Date.now() + timeoutMs
let lastError = null
let client = null

try {
  while (Date.now() < deadline) {
    try {
      const page = await findPage()
      if (!page) throw new Error('No renderer page is exposed by CDP yet.')
      const socket = await connectDebugger(page.webSocketDebuggerUrl)
      client = createCdpClient(socket)
      await client.send('Runtime.enable')
      const ui = await readUpdateUi(client)
      if (startupOnly && ui?.ready) {
        console.log('PASS: actual installed application rendered its workspace.')
        process.exitCode = 0
        break
      }
      const expectedText = `v${expectedVersion}`
      if (!startupOnly && ui?.ready && ui.open && ui.status.includes(`发现新版本 ${expectedText}`) && ui.version.includes(expectedText)) {
        console.log(`PASS: real installed renderer displayed update prompt for ${expectedText}.`)
        process.exitCode = 0
        break
      }
      lastError = new Error(`Installed renderer not ready (workspace=${ui?.ready}, open=${ui?.open}, status=${JSON.stringify(ui?.status)}, version=${JSON.stringify(ui?.version)}).`)
    } catch (error) {
      lastError = error
    } finally {
      client?.close()
      client = null
    }
    await delay(250)
  }
  if (process.exitCode !== 0) {
    const target = startupOnly ? 'the installed workspace' : `the real update prompt for v${expectedVersion}`
    throw new Error(`Timed out waiting for ${target}. ${lastError?.message || ''}`.trim())
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`)
  process.exitCode = 1
}
