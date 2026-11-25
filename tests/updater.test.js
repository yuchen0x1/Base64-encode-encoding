import { describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
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
  registerUpdaterIpc,
  getRuntimeCopyPath,
  getDownloadRoutes,
  isPublicGitHubReleaseAssetUrl,
  assertAllowedUpdateRedirect,
  measureSlowDownloadWindow,
  scoreDownloadRouteProbe,
  orderDownloadRoutesByProbeScore,
  scheduleStartupCheck,
  shutdownUpdater,
  MAX_UPDATE_PACKAGE_BYTES,
  UPDATE_DOWNLOAD_SLOW_MIN_BYTES,
  UPDATE_DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SECOND,
  UPDATE_DOWNLOAD_SLOW_WINDOW_MS,
  UPDATE_DOWNLOAD_SLOW_WINDOWS,
  UPDATE_ROUTE_PROBE_BYTES
} = await import('../electron/updater.js')
const validSha256 = 'a'.repeat(64)
const windowsIt = process.platform === 'win32' ? it : it.skip

describe('smart GitHub download routing', () => {
  const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`

  it('keeps redirects inside the expected publisher or feed host', () => {
    expect(assertAllowedUpdateRedirect(
      'https://objects.githubusercontent.com/github-production-release-asset-1/asset',
      official,
      '下载重定向'
    )).toBe(true)
    expect(assertAllowedUpdateRedirect(
      'https://gh-proxy.org/https://github.com/yuchen0x1/Base64-encode-encoding/releases/download/v1.0.1/setup.exe',
      `https://gh-proxy.org/${official}`,
      '下载重定向'
    )).toBe(true)
    expect(assertAllowedUpdateRedirect(
      'https://objects.githubusercontent.com/github-production-release-asset-1/asset',
      `https://ghproxy.net/${official}`,
      '下载重定向'
    )).toBe(true)
    expect(() => assertAllowedUpdateRedirect(
      'https://evil.example.test/setup.exe',
      `https://ghproxy.net/${official}`,
      '下载重定向'
    )).toThrow(/主机范围/)
    expect(() => assertAllowedUpdateRedirect('https://evil.example.test/setup.exe', official, '下载重定向'))
      .toThrow(/主机范围/)
    expect(() => assertAllowedUpdateRedirect('https://evil.example.test/setup.exe', 'https://updates.example.test/setup.exe', '下载重定向'))
      .toThrow(/主机范围/)
  })

  it('only proxies canonical public release assets', () => {
    expect(isPublicGitHubReleaseAssetUrl(official)).toBe(true)
    expect(getDownloadRoutes(official)).toEqual([
      { id: 'official', label: 'GitHub 官方线路', url: official },
      { id: 'gh-proxy', label: 'GH-Proxy 加速线路', url: `https://gh-proxy.org/${official}` },
      { id: 'ghproxy-net', label: '备用 GitHub 加速线路', url: `https://ghproxy.net/${official}` }
    ])
    expect(isPublicGitHubReleaseAssetUrl(`${RELEASES_URL}/latest/download/GeekToolbox-Setup-1.0.1.exe`)).toBe(true)
    expect(isPublicGitHubReleaseAssetUrl('https://api.github.com/repos/yuchen0x1/Base64-encode-encoding/releases/latest')).toBe(false)
    expect(isPublicGitHubReleaseAssetUrl('https://github.com/yuchen0x1/Base64-encode-encoding/raw/main/setup.exe')).toBe(false)
    expect(isPublicGitHubReleaseAssetUrl(`${official}?token=secret`)).toBe(false)
    expect(isPublicGitHubReleaseAssetUrl('https://user:pass@github.com/yuchen0x1/Base64-encode-encoding/releases/download/v1.0.1/setup.exe')).toBe(false)
    expect(getDownloadRoutes('https://updates.example.test/setup.exe')).toEqual([
      { id: 'official', label: 'GitHub 官方线路', url: 'https://updates.example.test/setup.exe' }
    ])
  })

  it('requires two consecutive slow windows after startup and resets on recovery', () => {
    const sample = {
      bytes: UPDATE_DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SECOND * UPDATE_DOWNLOAD_SLOW_WINDOW_MS / 1000 / 2,
      elapsedMs: UPDATE_DOWNLOAD_SLOW_WINDOW_MS,
      transferredBytes: UPDATE_DOWNLOAD_SLOW_MIN_BYTES,
      expectedSize: UPDATE_DOWNLOAD_SLOW_MIN_BYTES * 4
    }
    expect(measureSlowDownloadWindow({ ...sample, slowWindows: 0 })).toMatchObject({ slowWindows: 1, shouldSwitch: false })
    expect(measureSlowDownloadWindow({ ...sample, slowWindows: 1 })).toMatchObject({ slowWindows: 2, shouldSwitch: true })
    expect(measureSlowDownloadWindow({
      ...sample,
      bytes: UPDATE_DOWNLOAD_SLOW_THRESHOLD_BYTES_PER_SECOND * UPDATE_DOWNLOAD_SLOW_WINDOW_MS / 1000 * 2,
      slowWindows: 1
    })).toMatchObject({ slowWindows: 0, shouldSwitch: false })
    expect(measureSlowDownloadWindow({
      ...sample,
      transferredBytes: UPDATE_DOWNLOAD_SLOW_MIN_BYTES - 1,
      slowWindows: UPDATE_DOWNLOAD_SLOW_WINDOWS
    })).toMatchObject({ slowWindows: 0, shouldSwitch: false })
  })

  it('scores proxy probes by transfer rate and prefers measured routes over untested defaults', () => {
    const routes = [
      { id: 'gh-proxy', label: 'GH-Proxy' },
      { id: 'ghproxy-net', label: '备用代理' }
    ]
    const scores = new Map([
      ['gh-proxy', scoreDownloadRouteProbe({ bytes: 64 * 1024, elapsedMs: 200 })],
      ['ghproxy-net', scoreDownloadRouteProbe({ bytes: 64 * 1024, elapsedMs: 20 })]
    ])

    expect(scoreDownloadRouteProbe({ bytes: 0, elapsedMs: 20 })).toBe(0)
    expect(orderDownloadRoutesByProbeScore(routes, scores).map(route => route.id))
      .toEqual(['ghproxy-net', 'gh-proxy'])
    expect(orderDownloadRoutesByProbeScore(routes, new Map()).map(route => route.id))
      .toEqual(['gh-proxy', 'ghproxy-net'])
  })
})

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
  windowsIt('notifies an installed v0.1.1 client when GitHub latest advances to v0.1.2', async () => {
    await withPlatform('win32', async () => {
      const oldPackaged = electronMock.app.isPackaged
      electronMock.app.isPackaged = true
      electronMock.app.getVersion.mockReturnValue('0.1.1')
      const installerUrl = `${RELEASES_URL}/download/v0.1.2/GeekToolbox-Setup-0.1.2.exe`
      const installerSha256 = 'b'.repeat(64)
      const manifest = {
        version: '0.1.2',
        kind: 'nsis',
        package: { kind: 'http', url: installerUrl, sha256: installerSha256, size: 123 }
      }
      const manifestBytes = Buffer.from(JSON.stringify(manifest))
      const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex')
      const manifestUrl = `${RELEASES_URL}/download/v0.1.2/version.json`
      const release = {
        tag_name: 'v0.1.2',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: 'version.json',
            browser_download_url: manifestUrl,
            digest: `sha256:${manifestSha256}`,
            size: manifestBytes.length
          },
          {
            name: 'GeekToolbox-Setup-0.1.2.exe',
            browser_download_url: installerUrl,
            digest: `sha256:${installerSha256}`,
            size: 123
          }
        ]
      }
      const contents = {
        isDestroyed: () => false,
        isLoading: () => false,
        send: vi.fn()
      }
      const window = {
        isDestroyed: () => false,
        webContents: contents
      }
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url) === LATEST_RELEASE_API) return Response.json(release)
        if (String(url) === manifestUrl) return new Response(manifestBytes)
        throw new Error(`unexpected update check URL: ${url}`)
      })

      try {
        registerUpdaterIpc({ handle: vi.fn() }, { getMainWindow: () => window })
        scheduleStartupCheck(1)
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(contents.send).toHaveBeenCalledWith('update:event', {
          type: 'available',
          currentVersion: '0.1.1',
          latest: expect.objectContaining({
            version: '0.1.2',
            size: 123
          })
        })
      } finally {
        shutdownUpdater()
        registerUpdaterIpc({ handle: vi.fn() }, { getMainWindow: () => null })
        electronMock.app.isPackaged = oldPackaged
        electronMock.app.getVersion.mockReturnValue('1.0.0')
        delete electronMock.net.request
        fetchSpy.mockRestore()
      }
    })
  })

  windowsIt('parses GitHub API JSON through Electron net.request for packaged update checks', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-electron-net-update-'))
    const oldPackaged = electronMock.app.isPackaged
    const version = '0.1.3'
    const installerUrl = `${RELEASES_URL}/download/v${version}/GeekToolbox-Setup-${version}.exe`
    const installerSha256 = 'c'.repeat(64)
    const manifestBytes = Buffer.from(JSON.stringify({
      version,
      kind: 'nsis',
      package: { kind: 'http', url: installerUrl, sha256: installerSha256, size: 123 }
    }))
    const manifestUrl = `${RELEASES_URL}/download/v${version}/version.json`
    const manifestSha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex')
    const responses = new Map([
      [LATEST_RELEASE_API, JSON.stringify({
        tag_name: `v${version}`,
        draft: false,
        prerelease: false,
        assets: [
          { name: 'version.json', browser_download_url: manifestUrl, digest: `sha256:${manifestSha256}`, size: manifestBytes.length },
          { name: `GeekToolbox-Setup-${version}.exe`, browser_download_url: installerUrl, digest: `sha256:${installerSha256}`, size: 123 }
        ]
      })],
      [manifestUrl, manifestBytes.toString('utf8')]
    ])
    const requests = vi.fn(({ url }) => {
      const request = new EventEmitter()
      request.followRedirect = vi.fn()
      request.abort = vi.fn()
      request.end = () => {
        const body = responses.get(url)
        if (!body) throw new Error(`unexpected Electron net.request URL: ${url}`)
        const incoming = Readable.from([Buffer.from(body)])
        incoming.statusCode = 200
        incoming.headers = { 'content-type': 'application/json' }
        queueMicrotask(() => request.emit('response', incoming))
      }
      return request
    })
    electronMock.app.isPackaged = true
    electronMock.app.getVersion.mockReturnValue('0.1.2')
    electronMock.app.getPath.mockImplementation((name) => path.join(root, name === 'userData' ? '' : 'GeekToolbox.exe'))
    electronMock.net.request = requests

    try {
      await expect(checkForUpdates()).resolves.toMatchObject({
        supported: true,
        hasUpdate: true,
        currentVersion: '0.1.2',
        latest: { version, size: 123 }
      })
      expect(requests.mock.calls.map(([options]) => options.url)).toEqual([LATEST_RELEASE_API, manifestUrl])
    } finally {
      delete electronMock.net.request
      electronMock.app.isPackaged = oldPackaged
      electronMock.app.getVersion.mockReturnValue('1.0.0')
      await fs.promises.rm(root, { recursive: true, force: true })
    }
  })

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
        expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'manual' })
        expect(fs.existsSync(path.join(root, 'updates'))).toBe(false)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('blocks an unsafe redirect before following it', async () => {
    await withPlatform('win32', async () => {
      const request = new EventEmitter()
      request.followRedirect = vi.fn()
      request.abort = vi.fn()
      request.end = () => queueMicrotask(() => {
        request.emit('redirect', 302, 'GET', 'https://evil.example.test/version.json', {
          location: ['https://evil.example.test/version.json']
        })
      })
      const requestSpy = vi.fn(() => request)
      electronMock.net.request = requestSpy
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      try {
        await expect(checkForUpdates()).rejects.toThrow(/不在允许的主机范围/)
        expect(requestSpy).toHaveBeenCalledTimes(1)
        expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'manual',
          useSessionCookies: false
        }))
        expect(request.followRedirect).not.toHaveBeenCalled()
        expect(request.abort).toHaveBeenCalledTimes(1)
        expect(fetchSpy).not.toHaveBeenCalled()
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete electronMock.net.request
        fetchSpy.mockRestore()
      }
    })
  })

  windowsIt('honors redirect:error for GitHub release metadata', async () => {
    await withPlatform('win32', async () => {
      const oldPackaged = electronMock.app.isPackaged
      const request = new EventEmitter()
      request.followRedirect = vi.fn()
      request.abort = vi.fn()
      request.end = () => queueMicrotask(() => {
        request.emit(
          'redirect',
          301,
          'GET',
          LATEST_RELEASE_API,
          { location: [LATEST_RELEASE_API] }
        )
      })
      const requestSpy = vi.fn(() => request)
      electronMock.app.isPackaged = true
      electronMock.net.request = requestSpy
      delete process.env.TOOLBOX_UPDATE_FEED
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      try {
        await expect(checkForUpdates()).rejects.toThrow(/不允许重定向/)
        expect(requestSpy).toHaveBeenCalledTimes(1)
        expect(request.followRedirect).not.toHaveBeenCalled()
        expect(request.abort).toHaveBeenCalledTimes(1)
      } finally {
        electronMock.app.isPackaged = oldPackaged
        delete electronMock.net.request
        fetchSpy.mockRestore()
      }
    })
  })

  windowsIt('follows a same-host redirect and streams the manifest through Electron net.request', async () => {
    await withPlatform('win32', async () => {
      const request = new EventEmitter()
      const body = Readable.from([Buffer.from(JSON.stringify({ version: '1.0.0', kind: 'nsis' }))])
      body.statusCode = 200
      body.headers = { 'content-type': ['application/json'] }
      request.followRedirect = vi.fn(() => request.emit('response', body))
      request.abort = vi.fn()
      request.end = () => queueMicrotask(() => {
        request.emit(
          'redirect',
          302,
          'GET',
          'https://updates.example.test/version.json?redirected=1',
          { location: ['https://updates.example.test/version.json?redirected=1'] }
        )
      })
      const requestSpy = vi.fn(() => request)
      electronMock.net.request = requestSpy
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      try {
        await expect(checkForUpdates()).resolves.toMatchObject({
          supported: true,
          hasUpdate: false,
          currentVersion: '1.0.0'
        })
        expect(requestSpy).toHaveBeenCalledTimes(1)
        expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({
          credentials: 'omit',
          redirect: 'manual',
          useSessionCookies: false
        }))
        expect(request.followRedirect).toHaveBeenCalledTimes(1)
        expect(fetchSpy).not.toHaveBeenCalled()
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete electronMock.net.request
        fetchSpy.mockRestore()
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

  windowsIt('tries the documented GH-Proxy route after official release failures without credentials', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-proxy-'))
      const payload = Buffer.from('proxy installer payload')
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const proxy = `https://gh-proxy.org/${official}`
      const requests = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        requests.push({ url: String(url), options })
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (String(url) === official) throw new Error('simulated GitHub timeout')
        if (String(url) === proxy) {
          expect(options.headers?.Authorization || options.headers?.authorization).toBeUndefined()
          expect(options.headers?.Cookie || options.headers?.cookie).toBeUndefined()
          return new Response(payload, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }
        throw new Error(`unexpected installer URL: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await expect(checkForUpdates()).resolves.toMatchObject({ supported: true, hasUpdate: true })
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length })
        expect(requests.filter(item => item.url === official)).toHaveLength(3)
        expect(requests.filter(item => item.url === proxy)).toHaveLength(1)
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('probes and scores verified proxy routes before selecting the faster download', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-probe-score-'))
      const payload = Buffer.alloc(1_100_000, 0x53)
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const proxy = `https://gh-proxy.org/${official}`
      const backup = `https://ghproxy.net/${official}`
      const requests = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        const target = String(url)
        requests.push({ url: target, options })
        if (target.endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (target === official) throw new Error('simulated GitHub timeout')
        const range = Object.entries(options.headers || {})
          .find(([name]) => name.toLowerCase() === 'range')?.[1]
        if (target === proxy || target === backup) {
          expect(options.credentials).toBe('omit')
          expect(options.headers?.Authorization || options.headers?.authorization).toBeUndefined()
          expect(options.headers?.Cookie || options.headers?.cookie).toBeUndefined()
          if (!range && target === backup) {
            return new Response(payload, {
              status: 200,
              headers: { 'content-length': String(payload.length) }
            })
          }
          expect(range).toBe(`bytes=0-${UPDATE_ROUTE_PROBE_BYTES - 1}`)
          await new Promise(resolve => setTimeout(resolve, target === proxy ? 100 : 5))
          const bytes = payload.subarray(0, UPDATE_ROUTE_PROBE_BYTES)
          return new Response(bytes, {
            status: 206,
            headers: {
              'content-length': String(bytes.length),
              'content-range': `bytes 0-${bytes.length - 1}/${payload.length}`
            }
          })
        }
        throw new Error(`unexpected installer URL: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length })
        expect(requests.filter(item => item.url === official)).toHaveLength(3)
        expect(requests.filter(item => item.url === proxy)).toHaveLength(1)
        expect(requests.filter(item => item.url === backup)).toHaveLength(2)
        const lastOfficialAttempt = Math.max(...requests
          .map((item, index) => item.url === official ? index : -1)
          .filter(index => index >= 0))
        const firstProxyProbe = Math.min(...requests
          .map((item, index) => item.url === proxy || item.url === backup ? index : Number.POSITIVE_INFINITY))
        expect(lastOfficialAttempt).toBeLessThan(firstProxyProbe)
        expect(requests.find(item => item.url === backup && !item.options.headers?.Range)).toBeDefined()
        expect(requests.find(item => item.url === proxy && !item.options.headers?.Range)).toBeUndefined()
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('does not probe proxy routes when a large official download succeeds', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-official-first-'))
      const payload = Buffer.alloc(1_100_000, 0x67)
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const requests = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        const target = String(url)
        requests.push({ url: target, options })
        if (target.endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (target !== official) throw new Error(`unexpected proxy request: ${target}`)
        return new Response(payload, {
          status: 200,
          headers: { 'content-length': String(payload.length) }
        })
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length })
        expect(requests.filter(item => item.url === official)).toHaveLength(1)
        expect(requests.filter(item => item.url.startsWith('https://gh-proxy.org/'))).toHaveLength(0)
        expect(requests.filter(item => item.url.startsWith('https://ghproxy.net/'))).toHaveLength(0)
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('falls back to the verified second proxy without resuming another service partial', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-second-proxy-'))
      const payload = Buffer.from('second proxy installer payload')
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const proxy = `https://gh-proxy.org/${official}`
      const backup = `https://ghproxy.net/${official}`
      const requests = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        requests.push({ url: String(url), options })
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (String(url) === official) throw new Error('simulated GitHub timeout')
        if (String(url) === proxy) {
          expect(options.headers?.Range).toBeUndefined()
          expect(options.credentials).toBe('omit')
          return new Response('proxy unavailable', { status: 503 })
        }
        if (String(url) === backup) {
          expect(options.headers?.Range).toBeUndefined()
          expect(options.credentials).toBe('omit')
          expect(options.headers?.Authorization || options.headers?.authorization).toBeUndefined()
          expect(options.headers?.Cookie || options.headers?.cookie).toBeUndefined()
          return new Response(payload, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }
        throw new Error(`unexpected installer URL: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length })
        expect(requests.filter(item => item.url === official)).toHaveLength(3)
        expect(requests.filter(item => item.url === proxy)).toHaveLength(3)
        expect(requests.filter(item => item.url === backup)).toHaveLength(1)
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('switches to GH-Proxy when the official route stays below the speed floor', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-slow-route-'))
      const payload = Buffer.alloc(900_000, 0x5a)
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const proxy = `https://gh-proxy.org/${official}`
      const requests = []
      let now = 1_000_000
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        now += UPDATE_DOWNLOAD_SLOW_WINDOW_MS * 2
        return now
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        requests.push(String(url))
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (String(url) === official) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(payload.subarray(0, 300_000))
              controller.enqueue(payload.subarray(300_000, 600_000))
              controller.enqueue(payload.subarray(600_000))
              controller.close()
            }
          })
          return new Response(stream, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }
        if (String(url) === proxy) {
          expect(options.credentials).toBe('omit')
          expect(options.headers?.Authorization || options.headers?.authorization).toBeUndefined()
          expect(options.headers?.Cookie || options.headers?.cookie).toBeUndefined()
          return new Response(payload, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }
        throw new Error(`unexpected installer URL: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length })
        expect(requests.filter(url => url === official)).toHaveLength(1)
        expect(requests.filter(url => url === proxy)).toHaveLength(1)
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        nowSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('keeps a complete small package on the official route after slow windows', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-slow-complete-'))
      const payload = Buffer.alloc(600_000, 0x6a)
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const requests = []
      let now = 1_000_000
      const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        now += UPDATE_DOWNLOAD_SLOW_WINDOW_MS * 2
        return now
      })
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const target = String(url)
        requests.push(target)
        if (target.endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (target !== official) throw new Error(`unexpected proxy request: ${target}`)
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(payload.subarray(0, 300_000))
            controller.enqueue(payload.subarray(300_000))
            controller.close()
          }
        })
        return new Response(stream, {
          status: 200,
          headers: { 'content-length': String(payload.length) }
        })
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result).toMatchObject({ ok: true, size: payload.length })
        expect(requests.filter(url => url === official)).toHaveLength(1)
        expect(requests.some(url => url.startsWith('https://gh-proxy.org/'))).toBe(false)
        expect(requests.some(url => url.startsWith('https://ghproxy.net/'))).toBe(false)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        nowSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('drops an official partial before switching to GH-Proxy', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-proxy-partial-'))
      const payload = Buffer.from('proxy partial recovery payload')
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const proxy = `https://gh-proxy.org/${official}`
      let officialRequests = 0
      const proxyRanges = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (String(url) === official) {
          officialRequests += 1
          if (officialRequests > 1) expect(options.headers?.Range).toBe(`bytes=${payload.length > 5 ? 5 : 0}-`)
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(payload.subarray(0, 5))
              setTimeout(() => controller.error(new Error('simulated official reset')), 5)
            }
          })
          return new Response(stream, { status: 200, headers: { 'content-length': String(payload.length) } })
        }
        if (String(url) === proxy) {
          proxyRanges.push(options.headers?.Range || '')
          return new Response(payload, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }
        throw new Error(`unexpected installer URL: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result.ok).toBe(true)
        expect(officialRequests).toBe(3)
        expect(proxyRanges).toEqual([''])
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('validates GH-Proxy Range responses and restarts from zero on mismatch', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-proxy-range-'))
      const payload = Buffer.from('proxy range mismatch recovery payload')
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      const official = `${RELEASES_URL}/download/v1.0.1/GeekToolbox-Setup-1.0.1.exe`
      const proxy = `https://gh-proxy.org/${official}`
      const proxyRequests = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        if (String(url).endsWith('/version.json')) {
          expect(options).toMatchObject({ credentials: 'omit', redirect: 'manual' })
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: { kind: 'http', url: official, sha256, size: payload.length }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        if (String(url) === official) throw new Error('simulated GitHub timeout')
        if (String(url) === proxy) {
          proxyRequests.push(options)
          expect(options.credentials).toBe('omit')
          expect(options.headers?.Authorization || options.headers?.authorization).toBeUndefined()
          expect(options.headers?.Cookie || options.headers?.cookie).toBeUndefined()
          if (proxyRequests.length === 1) {
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(payload.subarray(0, 5))
                setTimeout(() => controller.error(new Error('simulated proxy reset')), 5)
              }
            })
            return new Response(stream, {
              status: 200,
              headers: { 'content-length': String(payload.length) }
            })
          }
          if (proxyRequests.length === 2) {
            expect(options.headers?.Range).toBe('bytes=5-')
            return new Response(payload.subarray(5), {
              status: 206,
              headers: {
                'content-length': String(payload.length - 5),
                'content-range': `bytes 0-${payload.length - 6}/${payload.length}`
              }
            })
          }
          expect(options.headers?.Range).toBeUndefined()
          return new Response(payload, {
            status: 200,
            headers: { 'content-length': String(payload.length) }
          })
        }
        throw new Error(`unexpected installer URL: ${url}`)
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result.ok).toBe(true)
        expect(proxyRequests).toHaveLength(3)
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
      } finally {
        delete process.env.TOOLBOX_UPDATE_FEED
        delete process.env.UPDATER_TEST_USER_DATA
        fetchSpy.mockRestore()
        await fs.promises.rm(root, { recursive: true, force: true })
      }
    })
  })

  windowsIt('rejects a mismatched Content-Range and retries the same route from zero', async () => {
    await withPlatform('win32', async () => {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'toolbox-updater-range-guard-'))
      const payload = Buffer.from('range validation payload')
      const sha256 = crypto.createHash('sha256').update(payload).digest('hex')
      let installerRequests = 0
      const ranges = []
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
        if (String(url).endsWith('/version.json')) {
          return new Response(JSON.stringify({
            version: '1.0.1',
            kind: 'nsis',
            package: {
              kind: 'http',
              url: 'https://updates.example.test/setup.exe',
              sha256,
              size: payload.length
            }
          }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        installerRequests += 1
        ranges.push(options.headers?.Range || '')
        if (installerRequests === 1) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(payload.subarray(0, 5))
              setTimeout(() => controller.error(new Error('simulated reset')), 5)
            }
          })
          return new Response(stream, { status: 200, headers: { 'content-length': String(payload.length) } })
        }
        if (installerRequests === 2) {
          return new Response(payload.subarray(5), {
            status: 206,
            headers: {
              'content-length': String(payload.length - 5),
              'content-range': `bytes 0-${payload.length - 6}/${payload.length}`
            }
          })
        }
        return new Response(payload, {
          status: 200,
          headers: { 'content-length': String(payload.length) }
        })
      })
      process.env.TOOLBOX_UPDATE_FEED = 'https://updates.example.test'
      process.env.UPDATER_TEST_USER_DATA = root
      electronMock.app.getPath.mockImplementation((name) => name === 'userData' ? root : path.join(root, 'GeekToolbox.exe'))

      try {
        await checkForUpdates()
        const result = await downloadUpdate()
        expect(result.ok).toBe(true)
        expect(ranges).toEqual(['', 'bytes=5-', ''])
        expect(await fs.promises.readFile(result.installer)).toEqual(payload)
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
