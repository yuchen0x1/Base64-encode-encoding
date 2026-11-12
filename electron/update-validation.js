import path from 'node:path'

export function isValidSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

export function isValidAuthenticodeThumbprint(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value.replace(/\s+/g, ''))
}

export function normalizeSignatureMetadata(signature) {
  if (signature == null) return null
  if (typeof signature !== 'object' || Array.isArray(signature)) {
    throw new Error('更新清单配置错误：package.signature 必须是对象')
  }
  if (signature.type !== 'authenticode') {
    throw new Error('更新清单配置错误：仅支持 Authenticode 签名（type: authenticode）')
  }
  const thumbprint = typeof signature.thumbprint === 'string'
    ? signature.thumbprint.replace(/\s+/g, '').toUpperCase()
    : ''
  if (!isValidAuthenticodeThumbprint(thumbprint)) {
    throw new Error('更新清单配置错误：package.signature.thumbprint 必须是 40 位十六进制指纹')
  }
  return {
    type: 'authenticode',
    thumbprint,
    subject: typeof signature.subject === 'string' ? signature.subject : ''
  }
}

function hasSupportedProtocol(value) {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

function hasExeExtension(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false

  let pathname = value
  if (/^https?:/i.test(value)) {
    if (!hasSupportedProtocol(value)) return false
    try {
      pathname = new URL(value).pathname
    } catch {
      return false
    }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^[a-z]:[\\/]/i.test(value)) {
    // file:, ftp: and other schemes are not download sources for this updater.
    return false
  }

  try {
    return /\.exe$/i.test(path.basename(decodeURIComponent(pathname)))
  } catch {
    return false
  }
}

/** Validate that a package is an integrity-protected Windows NSIS installer. */
export function assertSupportedInstallerPackage(pkg, kind, platform = process.platform) {
  if (platform !== 'win32') {
    throw new Error('Electron 自动更新仅支持 Windows 平台')
  }
  if (kind !== 'nsis') {
    throw new Error('更新清单配置错误：仅支持 Windows NSIS 安装包（kind: nsis）')
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error('更新清单配置错误：package 必须是对象')
  }
  if (pkg.kind !== 'http' && pkg.kind !== 'file') {
    throw new Error('更新清单配置错误：package 下载类型必须是 HTTP(S) 或本地文件')
  }
  if (!isValidSha256(pkg.sha256)) {
    throw new Error('更新清单配置错误：package.sha256 必须是 64 位十六进制 SHA-256')
  }
  if (pkg.kind === 'http' && !hasSupportedProtocol(pkg.url)) {
    throw new Error('更新清单配置错误：远程安装包必须使用有效的 HTTP(S) URL')
  }
  if (pkg.kind === 'file' && typeof pkg.url === 'string' && hasSupportedProtocol(pkg.url)) {
    throw new Error('更新清单配置错误：本地安装包不能使用远程 URL')
  }
  if (!hasExeExtension(pkg.url)) {
    throw new Error('更新清单配置错误：NSIS 安装包必须指向 .exe 文件')
  }
  normalizeSignatureMetadata(pkg.signature)
}
