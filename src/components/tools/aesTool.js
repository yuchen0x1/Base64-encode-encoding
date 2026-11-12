const AES_KEY_BYTE_LENGTHS = new Set([16, 24, 32])

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length
}

export function validateAesParameters({ key, iv = '', mode = 'CBC' }) {
  if (typeof key !== 'string') {
    return { valid: false, error: '密钥 KEY 必须是文本' }
  }
  const keyLength = utf8ByteLength(key)
  if (!AES_KEY_BYTE_LENGTHS.has(keyLength)) {
    return { valid: false, error: `密钥 KEY 的 UTF-8 长度必须为 16、24 或 32 字节（当前 ${keyLength} 字节）` }
  }
  if (!['CBC', 'ECB', 'CFB'].includes(mode)) {
    return { valid: false, error: '不支持的 AES 模式' }
  }
  if (mode !== 'ECB') {
    if (typeof iv !== 'string') {
      return { valid: false, error: '偏移向量 IV 必须是文本' }
    }
    const ivLength = utf8ByteLength(iv)
    if (ivLength !== 16) {
      return { valid: false, error: `偏移向量 IV 的 UTF-8 长度必须为 16 字节（当前 ${ivLength} 字节）` }
    }
  }
  return { valid: true }
}

export function parseCiphertext(text, encoding, mode = 'CBC') {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('密文不能为空')
  }
  if (encoding === 'Hex') {
    if (text.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(text)) {
      throw new Error('Hex 密文格式无效')
    }
    if (mode !== 'CFB' && (text.length / 2) % 16 !== 0) {
      throw new Error('AES 密文长度无效：CBC/ECB 密文必须是 16 字节的倍数')
    }
    return text
  }
  if (encoding === 'Base64') {
    const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}(?:==)?|[A-Za-z0-9+/]{3}=?|)?$/
    if (!validBase64.test(text) || text.length === 0) {
      throw new Error('Base64 密文格式无效')
    }
    const base64Body = text.replace(/=+$/, '')
    const decodedBytes = Math.floor(base64Body.length * 3 / 4)
    let binary
    try {
      binary = globalThis.atob(text)
    } catch {
      throw new Error('Base64 密文格式无效')
    }
    if (globalThis.btoa(binary) !== text) {
      throw new Error('Base64 密文格式无效')
    }
    if (mode !== 'CFB' && decodedBytes % 16 !== 0) {
      throw new Error('AES 密文长度无效：CBC/ECB 密文必须是 16 字节的倍数')
    }
    return text
  }
  throw new Error('不支持的密文编码')
}
