import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertTrustedIpcSender,
  createTrustedIpcHandler,
  isTrustedRendererUrl,
  registerTrustedIpcHandlers,
  resolveSafeExternalUrl
} from '../electron/ipc-security.js'

const indexFile = path.resolve('dist/index.html')
const indexUrl = pathToFileURL(indexFile).href

function trustedWindow() {
  const frame = { url: indexUrl, parent: null, detached: false }
  const contents = {
    mainFrame: frame,
    isDestroyed: vi.fn(() => false)
  }
  const window = {
    webContents: contents,
    isDestroyed: vi.fn(() => false)
  }
  return { frame, contents, window }
}

function trustedOptions(getMainWindow) {
  return {
    getMainWindow,
    isPackaged: true,
    indexFile
  }
}

describe('Electron IPC sender validation', () => {
  it('accepts exactly the packaged main document and main frame', () => {
    const { frame, contents, window } = trustedWindow()
    const options = trustedOptions(() => window)
    expect(assertTrustedIpcSender({ sender: contents, senderFrame: frame }, options)).toBe(true)
  })

  it('rejects a different webContents, iframe, detached frame and destroyed window', () => {
    const { frame, contents, window } = trustedWindow()
    const options = trustedOptions(() => window)

    expect(() => assertTrustedIpcSender({ sender: {}, senderFrame: frame }, options))
      .toThrow(/未授权/)
    expect(() => assertTrustedIpcSender({ sender: contents, senderFrame: { ...frame, parent: {} } }, options))
      .toThrow(/未授权/)
    expect(() => assertTrustedIpcSender({ sender: contents, senderFrame: { ...frame, detached: true } }, options))
      .toThrow(/未授权/)

    window.isDestroyed.mockReturnValue(true)
    expect(() => assertTrustedIpcSender({ sender: contents, senderFrame: frame }, options))
      .toThrow(/未授权/)
  })

  it('rejects a same-window navigation to another file or remote page', () => {
    const { frame, contents, window } = trustedWindow()
    const options = trustedOptions(() => window)
    const evilFrame = { ...frame, url: pathToFileURL(path.resolve('dist/evil.html')).href }
    contents.mainFrame = evilFrame
    expect(() => assertTrustedIpcSender({ sender: contents, senderFrame: evilFrame }, options))
      .toThrow(/未授权/)

    const remoteFrame = { ...frame, url: 'https://evil.example/' }
    contents.mainFrame = remoteFrame
    expect(() => assertTrustedIpcSender({ sender: contents, senderFrame: remoteFrame }, options))
      .toThrow(/未授权/)
  })

  it('never invokes a handler for unauthorized senders', async () => {
    const { window } = trustedWindow()
    const handler = vi.fn(() => 'secret')
    const wrapped = createTrustedIpcHandler(handler, trustedOptions(() => window))
    expect(() => wrapped({ sender: {}, senderFrame: {} }))
      .toThrow(/未授权/)
    expect(handler).not.toHaveBeenCalled()
  })

  it('registers only the explicit updater channels with the trusted wrapper', () => {
    const { frame, contents, window } = trustedWindow()
    const handlers = new Map()
    const ipcMain = {
      handle: vi.fn((channel, handler) => handlers.set(channel, handler))
    }
    const check = vi.fn(() => ({ hasUpdate: false }))
    expect(registerTrustedIpcHandlers(ipcMain, { 'update:check': check }, trustedOptions(() => window)))
      .toEqual(['update:check'])

    const wrapped = handlers.get('update:check')
    expect(wrapped({ sender: contents, senderFrame: frame })).toEqual({ hasUpdate: false })
    expect(() => wrapped({ sender: contents, senderFrame: { ...frame, parent: {} } }))
      .toThrow(/未授权/)
    expect(check).toHaveBeenCalledOnce()
    expect(() => registerTrustedIpcHandlers(ipcMain, { 'window:destroy': vi.fn() }, trustedOptions(() => window)))
      .toThrow(/未登记/)
  })
})

describe('renderer URL and external-link policy', () => {
  it('accepts the exact production file and exact development origin only', () => {
    expect(isTrustedRendererUrl(indexUrl, { isPackaged: true, indexFile })).toBe(true)
    expect(isTrustedRendererUrl(indexUrl + '#fragment', { isPackaged: true, indexFile })).toBe(false)
    expect(isTrustedRendererUrl(pathToFileURL(path.resolve('dist/other.html')).href, { isPackaged: true, indexFile }))
      .toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5173/', { isPackaged: false })).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173/admin', { isPackaged: false })).toBe(false)
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', { isPackaged: false })).toBe(false)
    expect(isTrustedRendererUrl('https://github.com/', { isPackaged: false })).toBe(false)
  })

  it('opens only credential-free HTTPS links on the official host allowlist', () => {
    expect(resolveSafeExternalUrl('https://github.com/yuchen0x1/Base64-encode-encoding'))
      .toBe('https://github.com/yuchen0x1/Base64-encode-encoding')
    expect(resolveSafeExternalUrl('https://qm.qq.com/q/bkacrv1t3G'))
      .toBe('https://qm.qq.com/q/bkacrv1t3G')
    expect(resolveSafeExternalUrl('http://github.com/example')).toBeNull()
    expect(resolveSafeExternalUrl('https://github.com.evil.example/')).toBeNull()
    expect(resolveSafeExternalUrl('https://github.com:444/')).toBeNull()
    expect(resolveSafeExternalUrl('https://user:pass@github.com/')).toBeNull()
    expect(resolveSafeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(resolveSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBeNull()
    expect(resolveSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })
})

describe('reload safety', () => {
  it('keeps the fixed dev origin trusted, but rejects a reloaded dev URL that carries query state', () => {
    expect(isTrustedRendererUrl('http://localhost:5173/', { isPackaged: false, devServerUrl: 'http://localhost:5173' })).toBe(true)
    expect(isTrustedRendererUrl('http://localhost:5173/?reloaded=1', {
      isPackaged: false,
      devServerUrl: 'http://localhost:5173'
    })).toBe(false)
  })

  it('rejects an IPC call after the trusted window is destroyed', () => {
    const { frame, contents, window } = trustedWindow()
    const handler = vi.fn(() => ({ ok: true }))
    const wrapped = createTrustedIpcHandler(handler, trustedOptions(() => window))
    const invoke = () => wrapped({ sender: contents, senderFrame: frame })
    expect(invoke()).toEqual({ ok: true })

    window.isDestroyed.mockReturnValue(true)
    expect(invoke).toThrow(/未授权/)
    expect(handler).toHaveBeenCalledOnce()
  })
})
