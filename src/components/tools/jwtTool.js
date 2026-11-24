const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/
const MAX_TOKEN_LENGTH = 64 * 1024
const MAX_SECRET_LENGTH = 8 * 1024
const TEXT_ENCODER = new TextEncoder()
const PARSE_ONLY_NOTICE = '（仅解析，不验签）'

function decodeBase64UrlBytes(value) {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid base64url segment')
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  if (globalThis.btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) !== padded) {
    throw new Error('Non-canonical base64url segment')
  }
  return bytes
}

function decodeBase64Url(value) {
  return new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64UrlBytes(value))
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseJwt(token) {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
    return { header: null, payload: null, valid: false, error: 'JWT 超过 64 KiB 上限' }
  }
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts.some(part => !part)) {
    return { header: null, payload: null, valid: false, error: 'JWT 必须包含三个非空段落' }
  }
  if (parts.some(part => !BASE64URL_PATTERN.test(part) || part.length % 4 === 1)) {
    return { header: null, payload: null, valid: false, error: 'JWT 包含无效的 base64url 段落' }
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts[0]))
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    if (!isJsonObject(header) || !isJsonObject(payload)) {
      return { header: null, payload: null, valid: false, error: 'JWT Header 与 Payload 必须是 JSON 对象' }
    }
    return { header, payload, signature: parts[2], valid: true }
  } catch (error) {
    return {
      header: null,
      payload: null,
      valid: false,
      error: error instanceof SyntaxError ? 'JWT Header 或 Payload 不是合法 JSON' : error.message
    }
  }
}

function signatureLabel(verification) {
  if (!verification) return { text: '未验签', kind: 'unverified' }
  if (verification.status === 'verified') return { text: 'HS256 签名有效', kind: 'verified' }
  if (verification.status === 'invalid-signature') return { text: 'HS256 签名无效', kind: 'invalid' }
  if (verification.status === 'unsupported-algorithm') {
    return { text: `不支持 ${verification.algorithm || '该算法'} 验签`, kind: 'unsupported' }
  }
  return { text: verification.error || '无法验签', kind: 'invalid' }
}

export function getJwtStatus(parsed, nowMs = Date.now(), verification = null) {
  const notice = verification ? '' : PARSE_ONLY_NOTICE
  if (!parsed.valid) {
    return {
      valid: false,
      expired: false,
      notYetValid: false,
      signature: signatureLabel(verification),
      text: `⚠️ 格式无效${notice}`
    }
  }

  const payload = parsed.payload
  const nowSeconds = nowMs / 1000
  const signature = signatureLabel(verification)
  const signatureSuffix = verification ? ` · ${signature.text}` : notice
  if (Number.isFinite(payload.nbf) && nowSeconds < payload.nbf) {
    return {
      valid: true,
      expired: false,
      notYetValid: true,
      signature,
      text: `🟡 尚未生效${signatureSuffix}`
    }
  }
  if (Number.isFinite(payload.exp) && nowSeconds >= payload.exp) {
    return {
      valid: true,
      expired: true,
      notYetValid: false,
      signature,
      text: `🔴 已过期${signatureSuffix}`
    }
  }
  if (!Number.isFinite(payload.exp)) {
    return {
      valid: true,
      expired: false,
      notYetValid: false,
      signature,
      text: `🔵 格式可解析，未声明过期时间${signatureSuffix}`
    }
  }
  return {
    valid: true,
    expired: false,
    notYetValid: false,
    signature,
    text: `🟢 格式可解析，当前时间声明有效${signatureSuffix}`
  }
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * 在本地通过 Web Crypto 验证 HS256 签名。
 * 返回值把“格式可解析”和“签名已通过”分开，绝不把解码成功当作验签成功。
 */
export async function verifyJwtHs256(token, secret, { cryptoImpl = globalThis.crypto } = {}) {
  const parsed = parseJwt(token)
  if (!parsed.valid) {
    return {
      status: 'invalid-format',
      verified: false,
      algorithm: null,
      parsed,
      error: parsed.error || 'JWT 格式无效'
    }
  }
  if (parsed.header.alg !== 'HS256') {
    return {
      status: 'unsupported-algorithm',
      verified: false,
      algorithm: typeof parsed.header.alg === 'string' ? parsed.header.alg : null,
      parsed,
      error: '仅支持本地验证 HS256；当前 Header 未声明 HS256'
    }
  }
  if (typeof secret !== 'string' || !secret) {
    return {
      status: 'missing-secret',
      verified: false,
      algorithm: 'HS256',
      parsed,
      error: '请输入 HS256 密钥后再验签'
    }
  }
  if (secret.length > MAX_SECRET_LENGTH) {
    return {
      status: 'invalid-secret',
      verified: false,
      algorithm: 'HS256',
      parsed,
      error: '密钥超过 8 KiB 上限'
    }
  }
  if (!cryptoImpl?.subtle) {
    return {
      status: 'unsupported-runtime',
      verified: false,
      algorithm: 'HS256',
      parsed,
      error: '当前运行环境不支持 Web Crypto，无法验签'
    }
  }

  const parts = token.trim().split('.')
  let signatureBytes
  try {
    signatureBytes = decodeBase64UrlBytes(parts[2])
  } catch {
    return {
      status: 'invalid-signature',
      verified: false,
      algorithm: 'HS256',
      parsed,
      error: '签名段不是规范的 base64url'
    }
  }

  try {
    const key = await cryptoImpl.subtle.importKey(
      'raw',
      TEXT_ENCODER.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const verified = await cryptoImpl.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      TEXT_ENCODER.encode(`${parts[0]}.${parts[1]}`)
    )
    return {
      status: verified ? 'verified' : 'invalid-signature',
      verified,
      algorithm: 'HS256',
      parsed,
      error: verified ? '' : 'HS256 签名与密钥不匹配，Token 可能被篡改'
    }
  } catch (error) {
    return {
      status: 'error',
      verified: false,
      algorithm: 'HS256',
      parsed,
      error: error?.message || '验签过程失败'
    }
  }
}

/**
 * 生成用于本地验签界面的真实 HS256 示例 Token。
 * 返回的密钥只用于演示，不会写入存储。
 */
export async function createJwtHs256Sample({
  secret = 'toolbox-demo-secret',
  nowMs = Date.now(),
  cryptoImpl = globalThis.crypto
} = {}) {
  const now = Math.floor(nowMs / 1000)
  const header = bytesToBase64Url(TEXT_ENCODER.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = bytesToBase64Url(TEXT_ENCODER.encode(JSON.stringify({
    sub: 'demo-user',
    name: '极客工具箱 🚀',
    roles: ['read', 'write'],
    iat: now,
    exp: now + 7 * 24 * 60 * 60
  })))
  const signingInput = `${header}.${payload}`
  const key = await cryptoImpl.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(await cryptoImpl.subtle.sign('HMAC', key, TEXT_ENCODER.encode(signingInput)))
  return { token: `${signingInput}.${bytesToBase64Url(signature)}`, secret }
}

export function getJwtClaims(payload, nowMs = Date.now()) {
  const claims = [
    ['iat', '签发时间'],
    ['nbf', '生效时间'],
    ['exp', '过期时间']
  ]
  return claims.flatMap(([key, name]) => {
    const seconds = payload[key]
    if (!Number.isFinite(seconds)) return []
    const target = seconds * 1000
    const diffSec = Math.round((target - nowMs) / 1000)
    const isPast = diffSec < 0
    const abs = Math.abs(diffSec)
    const d = Math.floor(abs / 86400)
    const h = Math.floor((abs % 86400) / 3600)
    const m = Math.floor((abs % 3600) / 60)
    const duration = `${d ? d + '天 ' : ''}${h ? h + '小时 ' : ''}${m}分钟`
    let diffText
    if (key === 'nbf') {
      diffText = isPast ? `已生效 ${duration}` : `将在 ${duration} 后生效`
    } else if (key === 'iat') {
      diffText = isPast ? `已签发 ${duration}前` : `将在 ${duration}后签发`
    } else {
      diffText = isPast ? `已过期 ${duration}` : `将在 ${duration} 后过期`
    }
    return [{
      key,
      name,
      seconds,
      formatted: new Date(target).toLocaleString(),
      isPast,
      diffText
    }]
  })
}
