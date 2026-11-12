import CryptoJS from 'crypto-js'

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function signJwtHs256({ headerJson, payloadJson, secret, expirySeconds, nowSeconds = Math.floor(Date.now() / 1000) }) {
  let header
  try {
    header = JSON.parse(headerJson)
  } catch {
    return { ok: false, error: 'Header 不是合法 JSON' }
  }
  if (!isJsonObject(header)) {
    return { ok: false, error: 'Header 必须是 JSON 对象' }
  }
  if (header.alg !== 'HS256') {
    return { ok: false, error: '仅支持 HS256，Header alg 必须为 HS256' }
  }

  let payload
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return { ok: false, error: 'Payload 不是合法 JSON' }
  }
  if (!isJsonObject(payload)) {
    return { ok: false, error: 'Payload 必须是 JSON 对象' }
  }
  if (!secret) return { ok: false, error: '请填写签名密钥' }
  if (!Number.isFinite(expirySeconds) || expirySeconds < 0) {
    return { ok: false, error: '有效期必须是非负有限数字' }
  }

  const finalPayload = { ...payload }
  if (typeof finalPayload.iat !== 'number') finalPayload.iat = nowSeconds
  if (expirySeconds > 0) finalPayload.exp = nowSeconds + expirySeconds

  const headerB64 = encodeBase64Url(JSON.stringify(header))
  const payloadB64 = encodeBase64Url(JSON.stringify(finalPayload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = CryptoJS.HmacSHA256(signingInput, secret).toString(CryptoJS.enc.Base64)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { ok: true, token: `${signingInput}.${signature}` }
}

export function decodeBase64UrlJsonPart(part) {
  if (!BASE64URL_PATTERN.test(part) || part.length % 4 === 1) {
    throw new Error('Invalid base64url segment')
  }
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = globalThis.atob(padded)
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
