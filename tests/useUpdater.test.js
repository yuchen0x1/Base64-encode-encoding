import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('__RELEASE_NOTES__', ['Windows 更新'])
  vi.stubGlobal('__RELEASE_DATE__', '2026-11-13')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected web update request') }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function desktopBridge() {
  const bridge = {
    getInfo: vi.fn(async () => ({ portable: false })),
    onEvent: vi.fn(),
    check: vi.fn(async () => ({
      currentVersion: '0.0.6',
      hasUpdate: true,
      latest: { version: '0.0.7', size: 1024, notes: ['新版'] }
    })),
    download: vi.fn(async () => ({ ok: true })),
    cancel: vi.fn(async () => ({ ok: true, cancelled: true })),
    install: vi.fn(async () => ({ ok: true }))
  }
  vi.stubGlobal('window', { toolboxUpdater: bridge })
  return bridge
}

describe('Windows renderer update flow', () => {
  it('uses only desktop IPC for check, download and install', async () => {
    const bridge = desktopBridge()
    const { useUpdater } = await import('../src/composables/useUpdater.js')
    const updater = useUpdater()
    expect((await updater.checkForUpdates({ manual: true })).hasUpdate).toBe(true)
    expect(updater.state.status).toBe('available')
    expect(updater.modeLabel.value).toContain('Windows')
    await updater.downloadUpdate()
    expect(updater.state.status).toBe('ready')
    await updater.installUpdate()
    expect(updater.state.status).toBe('restarting')
    expect(bridge.check).toHaveBeenCalledOnce()
    expect(bridge.download).toHaveBeenCalledOnce()
    expect(bridge.install).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not schedule or request web updates in the development preview', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {})
    const { useUpdater, scheduleStartupCheck } = await import('../src/composables/useUpdater.js')
    const updater = useUpdater()
    scheduleStartupCheck()
    await vi.runAllTimersAsync()
    expect(updater.state.status).toBe('idle')
    expect(updater.modeLabel.value).toBe('界面开发预览')
    const result = await updater.checkForUpdates({ manual: true })
    expect(result.error).toContain('Windows')
    expect(updater.state.status).toBe('error')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('supports a retry after a preview check fails and desktop IPC becomes available', async () => {
    vi.stubGlobal('window', {})
    const { useUpdater } = await import('../src/composables/useUpdater.js')
    const updater = useUpdater()
    await updater.checkForUpdates({ manual: true })
    const bridge = desktopBridge()
    expect((await updater.checkForUpdates({ manual: true })).hasUpdate).toBe(true)
    expect(bridge.check).toHaveBeenCalledOnce()
  })

  it('keeps the update panel open with an error when desktop installation fails', async () => {
    const bridge = desktopBridge()
    bridge.install.mockResolvedValue({ ok: false, error: '助手未就绪' })
    const { useUpdater } = await import('../src/composables/useUpdater.js')
    const updater = useUpdater()
    await updater.checkForUpdates({ manual: true })
    await updater.downloadUpdate()
    await expect(updater.installUpdate()).rejects.toThrow('助手未就绪')
    expect(updater.state.open).toBe(true)
    expect(updater.state.status).toBe('error')
    expect(updater.state.error).toBe('助手未就绪')
  })

  it('cancels an active desktop download through the preload bridge', async () => {
    const bridge = desktopBridge()
    let resolveDownload
    bridge.download.mockImplementation(() => new Promise((resolve) => { resolveDownload = resolve }))
    const { useUpdater } = await import('../src/composables/useUpdater.js')
    const updater = useUpdater()
    await updater.checkForUpdates({ manual: true })
    const pending = updater.downloadUpdate()
    await Promise.resolve()
    expect(updater.state.status).toBe('downloading')
    await expect(updater.cancelDownloadUpdate()).resolves.toMatchObject({ ok: true, cancelled: true })
    expect(bridge.cancel).toHaveBeenCalledOnce()
    resolveDownload({ ok: true })
    await pending
    expect(updater.state.status).toBe('ready')
  })
})
