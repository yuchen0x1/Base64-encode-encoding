const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/

function decodeBase64Url(value) {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid base64url segment')
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (globalThis.btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) !== padded) {
    throw new Error('Non-canonical base64url segment')
  }
  return decoded
}

function isJsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseJwt(token) {
  const parts = token.trim().split('.')
  if (parts.length !== 3 || parts.some(part => !part)) {
    return { header: null, payload: null, valid: false }
  }
  if (parts.some(part => !BASE64URL_PATTERN.test(part) || part.length % 4 === 1)) {
    return { header: null, payload: null, valid: false }
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts[0]))
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    if (!isJsonObject(header) || !isJsonObject(payload)) {
      return { header: null, payload: null, valid: false }
    }
    return { header, payload, valid: true }
  } catch {
    return { header: null, payload: null, valid: false }
  }
}

export function getJwtStatus(parsed, nowMs = Date.now()) {
  const notice = '（仅解析，不验签）'
  if (!parsed.valid) {
    return {
      valid: false,
      expired: false,
      notYetValid: false,
      text: `⚠️ 格式无效${notice}`
    }
  }

  const payload = parsed.payload
  const nowSeconds = nowMs / 1000
  if (Number.isFinite(payload.nbf) && nowSeconds < payload.nbf) {
    return {
      valid: true,
      expired: false,
      notYetValid: true,
      text: `🟡 尚未生效${notice}`
    }
  }
  if (Number.isFinite(payload.exp) && nowSeconds >= payload.exp) {
    return {
      valid: true,
      expired: true,
      notYetValid: false,
      text: `🔴 已过期${notice}`
    }
  }
  if (!Number.isFinite(payload.exp)) {
    return {
      valid: true,
      expired: false,
      notYetValid: false,
      text: `🔵 格式可解析，未声明过期时间${notice}`
    }
  }
  return {
    valid: true,
    expired: false,
    notYetValid: false,
    text: `🟢 格式可解析，当前时间声明有效${notice}`
  }
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
