import { isNewerVersion } from './version.js'

export const REPOSITORY = 'yuchen0x1/Base64-encode-encoding'
export const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
export const STABLE_TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

async function fetchStableRelease(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'GeekToolbox' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000)
  })
  if (!response.ok) throw new Error(`GitHub Releases HTTP ${response.status}`)
  const release = await response.json()
  if (!STABLE_TAG.test(release?.tag_name) || release.draft !== false || release.prerelease !== false ||
      !Array.isArray(release.assets)) {
    throw new Error('Invalid GitHub stable release metadata')
  }
  return release
}

export function fetchLatestRelease(fetchImpl = fetch) {
  return fetchStableRelease(LATEST_RELEASE_API, fetchImpl)
}

export async function fetchReleaseByVersion(version, fetchImpl = fetch) {
  const tag = `v${version}`
  if (!STABLE_TAG.test(tag)) throw new Error('Invalid stable version')
  const release = await fetchStableRelease(`https://api.github.com/repos/${REPOSITORY}/releases/tags/${tag}`, fetchImpl)
  if (release.tag_name !== tag) throw new Error('Unexpected GitHub release tag')
  return release
}

export function getReleaseAsset(release, name) {
  const expectedUrl = `${RELEASES_URL}/download/${release.tag_name}/${name}`
  const asset = release.assets.find(item => item?.name === name)
  if (!asset || asset.browser_download_url !== expectedUrl || !/^sha256:[a-f0-9]{64}$/i.test(asset.digest) ||
      !Number.isSafeInteger(asset.size) || asset.size < 1) {
    throw new Error(`Missing or invalid GitHub release asset: ${name}`)
  }
  return { url: expectedUrl, size: asset.size, sha256: asset.digest.slice(7).toLowerCase() }
}

export function getCliUpdate(release, currentVersion) {
  const latestVersion = release.tag_name.slice(1)
  if (!isNewerVersion(latestVersion, currentVersion)) return { currentVersion, latestVersion, updateAvailable: false }
  return {
    currentVersion, latestVersion, updateAvailable: true,
    asset: getReleaseAsset(release, `GeekToolbox-CLI-${latestVersion}.mjs`)
  }
}
