import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const mocks = vi.hoisted(() => ({
  app: { isPackaged: false, getVersion: () => '1.0.0', getName: () => 'test', getPath: vi.fn(), exit: vi.fn() },
  prepare: vi.fn(), start: vi.fn()
}))
vi.mock('electron', () => ({ app: mocks.app, net: {}, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('../electron/installer-bootstrap.js', () => ({ prepareInstallerRuntime: mocks.prepare, startInstallerHelper: mocks.start }))

async function fixture(callback) {
  vi.resetModules()
  mocks.app.exit.mockClear()
  mocks.prepare.mockReset().mockImplementation(async (_, runtime) => { await fs.mkdir(path.dirname(runtime), { recursive: true }) })
  mocks.start.mockReset()
  const base = path.resolve('.tmp-verify')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'handoff-unit-'))
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' })
  const oldFeed = process.env.TOOLBOX_UPDATE_FEED
  const oldDir = process.env.TOOLBOX_APP_DIR
  try {
    const payload = Buffer.from('installer fixture')
    const feed = path.join(root, 'feed')
    const target = path.join(root, 'installed app')
    await fs.mkdir(feed)
    await fs.mkdir(target)
    await fs.writeFile(path.join(feed, 'setup.exe'), payload)
    await fs.writeFile(path.join(feed, 'version.json'), JSON.stringify({ version: '1.0.1', kind: 'nsis', package: {
      url: 'setup.exe', size: payload.length, sha256: crypto.createHash('sha256').update(payload).digest('hex')
    } }))
    process.env.TOOLBOX_UPDATE_FEED = feed
    process.env.TOOLBOX_APP_DIR = target
    mocks.app.getPath.mockImplementation(name => name === 'userData' ? root : path.join(target, 'test.exe'))
    const updater = await import('../electron/updater.js')
    await updater.checkForUpdates()
    await updater.downloadUpdate()
    await callback(updater)
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform)
    if (oldFeed === undefined) delete process.env.TOOLBOX_UPDATE_FEED
    else process.env.TOOLBOX_UPDATE_FEED = oldFeed
    if (oldDir === undefined) delete process.env.TOOLBOX_APP_DIR
    else process.env.TOOLBOX_APP_DIR = oldDir
    vi.useRealTimers()
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('old app exit is gated by helper readiness', () => {
  it('keeps the app alive when runtime preparation or startup fails', async () => {
    await fixture(async updater => {
      mocks.prepare.mockRejectedValueOnce(new Error('missing icudtl.dat'))
      await expect(updater.installUpdate()).rejects.toThrow('icudtl.dat')
      expect(mocks.app.exit).not.toHaveBeenCalled()
      mocks.start.mockRejectedValueOnce(new Error('runtime crashed'))
      await expect(updater.installUpdate()).rejects.toThrow('runtime crashed')
      expect(mocks.app.exit).not.toHaveBeenCalled()
    })
  })

  it('waits for acknowledgement, then schedules exit and rejects duplicate installs', async () => {
    await fixture(async updater => {
      let acknowledge
      mocks.start.mockImplementation(() => new Promise(resolve => { acknowledge = resolve }))
      const installing = updater.installUpdate()
      await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
      expect(mocks.app.exit).not.toHaveBeenCalled()
      await expect(updater.installUpdate()).rejects.toThrow('已经开始')
      vi.useFakeTimers()
      acknowledge({})
      await installing
      expect(mocks.app.exit).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(350)
      expect(mocks.app.exit).toHaveBeenCalledWith(0)
    })
  })
})
