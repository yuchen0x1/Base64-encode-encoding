import { describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { LATEST_RELEASE_API, RELEASES_URL } from '../shared/github-release.js'

const electronMock = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn((name) => path.join(process.env.UPDATER_TEST_USER_DATA || '', name === 'userData' ? '' : 'GeekToolbox.exe')),
    getName: vi.fn(() => 'GeekToolbox'),
    exit: vi.fn()
  },
  net: { fetch: (...args) => globalThis.fetch(...args) },
  BrowserWindow: { getAllWindows: () => [] }
}))

vi.mock('electron', () => electronMock)

const {
  checkForUpdates,
  downloadUpdate,
  cancelDownloadUpdate,
  installUpdate,
  getRuntimeCopyPath,
  MAX_UPDATE_PACKAGE_BYTES
} = await import('../electron/updater.js')
const validSha256 = 'a'.repeat(64)
const windowsIt = process.platform === 'win32' ? it : it.skip

async function withFeed(manifest, callback) {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-feed-'))
  const feed = path.join(root, 'feed')
  await fs.promises.mkdir(feed)
  await fs.promises.writeFile(path.join(feed, 'version.json'), JSON.stringify(manifest))
  process.env.TOOLBOX_UPDATE_FEED = feed
  process.env.UPDATER_TEST_USER_DATA = root
  electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))
  try {
    return await callback(root, feed)
  } finally {
    delete process.env.TOOLBOX_UPDATE_FEED
    delete process.env.UPDATER_TEST_USER_DATA
    await fs.promises.rm(root, { recursive: true, force: true })
  }
}

async function withPlatform(platform, callback) {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform })
  try {
    return await callback()
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform)
  }
}

describe('Electron updater package enforcement', () => {
  windowsIt.each([true, false])('checks the packaged manifest against the release API (authentic: %s)', async authentic => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-official-feed-'))
    const oldPackaged = electronMock.app.isPackaged
    electronMock.app.isPackaged = true
    electronMock.app.getPath.mockImplementation(() => path.join(root, 'GeekToolbox.exe'))
    const version = '1.0.1'
    const base = `${RELEASES_URL}/download/v${version}/`
    const name = `GeekToolbox-Setup-${version}.exe`
    const manifest = JSON.stringify({ version, kind: 'nsis', package: { url: name, sha256: validSha256, size: 128 } })
    const manifestDigest = crypto.createHash('sha256').update(manifest).digest('hex')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url === base + 'version.json') return new Response(authentic ? manifest : manifest + ' ')
      if (url !== LATEST_RELEASE_API) throw new Error(`Unexpected URL ${url}`)
      return new Response(JSON.stringify({
        tag_name: `v${version}`, draft: false, prerelease: false,
        assets: [
          { name, size: 128, digest: 'sha256:' + validSha256, browser_download_url: base + name },
          { name: 'version.json', size: manifest.length, digest: 'sha256:' + manifestDigest, browser_download_url: base + 'version.json' }
        ]
      }))
    })
    try {
      if (authentic) await expect(checkForUpdates()).resolves.toMatchObject({ hasUpdate: true, latest: { version, size: 128 } })
      else {
        await expect(checkForUpdates()).rejects.toThrow(/SHA-256 不一致/)
        await expect(downloadUpdate()).rejects.toThrow(/没有可用的更新/)
      }
    } finally {
      fetchSpy.mockRestore()
      electronMock.app.isPackaged = oldPackaged
      await fs.promises.rm(root, { recursive: true, force: true })
    }
  })

  windowsIt.each([403, 429])('falls back to the latest manifest when the release API is rate-limited (%s)', async status => {
    const oldPackaged = electronMock.app.isPackaged
    electronMock.app.isPackaged = true
    const version = '1.0.1'
    const name = `GeekToolbox-Setup-${version}.exe`
    const manifestUrl = `${RELEASES_URL}/latest/download/version.json`
    const manifest = JSON.stringify({
      version,
      kind: 'nsis',
      package: { url: name, sha256: validSha256, size: 128 }
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (url === LATEST_RELEASE_API) return new Response('', { status })
      if (url === manifestUrl) return new Response(manifest, { status: 200 })
      throw new Error(`Unexpected URL ${url}`)
    })

    try {
      await expect(checkForUpdates()).resolves.toMatchObject({ hasUpdate: true, latest: { version, size: 128 } })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([LATEST_RELEASE_API, manifestUrl])
    } finally {
      fetchSpy.mockRestore()
      electronMock.app.isPackaged = oldPackaged
    }
  })

  it('places the helper runtime copy outside the installed application directory', () => {
    const workDir = path.join('C:\\Users\\test', 'AppData', 'Roaming', '极客工具箱', 'updates')
    const runtimeCopy = getRuntimeCopyPath(workDir, 1234, 5678)

    expect(runtimeCopy).toBe(path.join(workDir, 'toolbox-updater-runtime-5678-1234', 'runtime.exe'))
    expect(path.dirname(path.dirname(runtimeCopy))).toBe(workDir)
    expect(path.basename(runtimeCopy)).not.toBe('极客工具箱.exe')
  })

  windowsIt.each([
    ['missing hash', undefined],
    ['empty hash', ''],
    ['short hash', 'a'.repeat(63)],
    ['long hash', 'a'.repeat(65)],
    ['non-hex hash', `${'a'.repeat(63)}g`]
  ])('fails closed for a %s local feed before download starts', async (_label, sha256) => {
    await withPlatform('win32', async () => {
      await withFeed({
        version: '1.0.1',
        kind: 'nsis',
        package: { kind: 'file', url: 'installer.exe', sha256 }
      }, async () => {
        await expect(checkForUpdates()).rejects.toThrow(/package\.sha256.*64/)
        await expect(downloadUpdate()).rejects.toThrow(/没有可用的更新/)
        expect(fs.existsSync(path.join(process.env.UPDATER_TEST_USER_DATA || '', 'updates'))).toBe(false)
      })
    })
  })

  windowsIt('fails closed for an HTTP feed missing the hash without requesting installer bytes', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-http-'))
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: 'installer.exe' }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        throw new Error(`unexpected installer request: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await expect(checkForUpdates()).rejects.toThrow(/package\.sha256.*64/)
        await expect(downloadUpdate()).rejects.toThrow(/没有可用的更新/)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        expect(fs.existsSync(path.join(root, 'updates'))).toBe(false)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('rejects an insecure HTTP update feed in packaged mode', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-http-security-'))
    const oldPackaged = electronMock.app.isPackaged
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('HTTP feed should be rejected before fetch')
    })
    electronMock.app.isPackaged = true
    process.env.TOOLBOX_UPDATE_FEED = 'http://updates.example.test'
    process.env.UPDATER_TEST_USER_DATA = root
    try {
      await expect(checkForUpdates()).rejects.toThrow(/必须使用 HTTPS/)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      electronMock.app.isPackaged = oldPackaged
      delete process.env.TOOLBOX_UPDATE_FEED
      delete process.env.UPDATER_TEST_USER_DATA
      fetchSpy.mockRestore()
      await fs.promises.rm(root, { recursive: true, force: true })
    }
  })

  windowsIt('retries an interrupted HTTP download and resumes with Range when supported', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-range-'))
      const payload = Buffer.from('0123456789abcdef')
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      let installerRequests = 0
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: {
              kind: 'http',
              url: 'installer.exe',
              sha256,
              size: payload.length
            }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }

        installerRequests += 1
        const range = options.headers?.Range || options.headers?.range || ''
        if (installerRequests === 1) {
          expect(range).toBe('')
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(payload.subarray(0, 5))
              setTimeout(() => controller.error(new Error('simulated connection reset')), 20)
            }
          })
          return new Response(stream, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }

        expect(range).toBe('bytes=5-')
        return new Response(payload.subarray(5), {
          status: 206,
          headers: {
            'content-length': String(payload.length - 5),
            'content-range': `bytes 5-${payload.length - 1}/${payload.length}`
          }
        })
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        const checked = await checkForUpdates()
        expect(checked).toMatchObject({ supported: true, hasUpdate: true })
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length, signature: { status: 'missing', signed: false } })
        expect(installerRequests).toBe(2)
        expect(fetchSpy).toHaveBeenCalledTimes(3)
        const installerPath = result.installer
        expect(await fs.promises.readFile(installerPath)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('rejects an oversized update before requesting installer bytes', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-size-'))
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: {
              kind: 'http',
              url: 'installer.exe',
              sha256: validSha256,
              size: MAX_UPDATE_PACKAGE_BYTES + 1
            }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        throw new Error('oversized package should be rejected before download')
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        await expect(downloadUpdate()).rejects.toThrow(/大小上限/)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('cancels an in-flight HTTP download and removes the partial installer', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-cancel-'))
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: {
              kind: 'http',
              url: 'installer.exe',
              sha256: validSha256,
              size: 16
            }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        const stream = new ReadableStream({
          start(controller) {
            options.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true })
          }
        })
        return new Response(stream, { status: 200, headers: { 'content-length': '16' } })
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const pending = downloadUpdate()
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(cancelDownloadUpdate()).toMatchObject({ ok: true, cancelled: true })
        await expect(pending).rejects.toThrow(/取消/)
        expect(fs.existsSync(path.join(root, 'updates'))).toBe(true)
        expect((await fs.promises.readdir(path.join(root, 'updates')))).toHaveLength(0)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  it('checks a manifest on non-Windows but reports automatic install unsupported', async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'darwin' })
    try {
      const result = await checkForUpdates()
      expect(result).toMatchObject({ supported: false, hasUpdate: false })
      await expect(downloadUpdate()).rejects.toThrow(/Windows NSIS/)
      await expect(installUpdate()).rejects.toThrow(/Windows NSIS/)
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform)
    }
  })

  windowsIt('rejects an update manifest that does not identify its package as NSIS', async () => {
    await withPlatform('win32', async () => {
      await withFeed({
        version: '1.0.1',
        kind: 'zip',
        package: { kind: 'http', url: 'https://updates.example.test/installer.exe', sha256: validSha256 }
      }, async () => {
        await expect(checkForUpdates()).rejects.toThrow(/Windows NSIS/)
        await expect(downloadUpdate()).rejects.toThrow(/没有可用的更新/)
      })
    })
  })
})
