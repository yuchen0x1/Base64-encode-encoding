export const PASSWORD_CHARACTER_SETS = Object.freeze({
  includeUpper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  includeLower: 'abcdefghijklmnopqrstuvwxyz',
  includeNumbers: '0123456789',
  includeSymbols: '!@#$%^&*()_+~`|}{[]:;?><,./-='
})

function requireRandomSource(source) {
  if (typeof source?.getRandomValues !== 'function') throw new Error('当前环境不支持安全随机数，请使用现代浏览器或桌面版')
  return source
}

function randomIndex(length, source) {
  const limit = Math.floor(0x100000000 / length) * length
  const word = new Uint32Array(1)
  // Rejection sampling avoids modulo bias. Bound retries so a broken entropy
  // provider cannot lock up the UI.
  for (let tries = 0; tries < 128; tries++) {
    source.getRandomValues(word)
    if (word[0] < limit) return word[0] % length
  }
  throw new Error('安全随机数生成失败，请重试')
}

export function generateSecurePassword(options, cryptoSource = globalThis.crypto) {
  const { length } = options
  if (!Number.isInteger(length) || length < 8 || length > 64) throw new Error('密码长度必须为 8–64 的整数')
  const groups = Object.entries(PASSWORD_CHARACTER_SETS).filter(([key]) => options[key]).map(([, chars]) => chars)
  if (!groups.length) throw new Error('请至少选择一种字符类型')
  const source = requireRandomSource(cryptoSource)
  const alphabet = groups.join('')
  const output = groups.map(chars => chars[randomIndex(chars.length, source)])
  while (output.length < length) output.push(alphabet[randomIndex(alphabet.length, source)])
  for (let i = output.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, source)
    ;[output[i], output[j]] = [output[j], output[i]]
  }
  return output.join('')
}

export function generateUuidV4(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === 'function') return cryptoSource.randomUUID()
  // randomUUID requires a secure context. getRandomValues is also available on
  // ordinary LAN HTTP pages; keep the fallback cryptographically random.
  const bytes = requireRandomSource(cryptoSource).getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
