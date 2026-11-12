const utf8Decoder = () => new TextDecoder('utf-8', { fatal: true })

export function encodeUtf8ToBase64(text, urlSafe = false) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  const chunkSize = 8192

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length))
    binary += String.fromCharCode(...chunk)
  }

  let encoded = globalThis.btoa(binary)
  if (urlSafe) {
    encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return encoded
}

export function decodeBase64ToUtf8(text, urlSafe = false) {
  let clean = text.trim()
  if (!clean) return ''

  try {
    if (urlSafe || clean.includes('-') || clean.includes('_')) {
      clean = clean.replace(/-/g, '+').replace(/_/g, '/')
      while (clean.length % 4) clean += '='
    }

    const binary = globalThis.atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return utf8Decoder().decode(bytes)
  } catch (cause) {
    throw new Error('无效的 Base64 格式或编码损坏', { cause })
  }
}

export function encodeHexText(text) {
  return Array.from(new TextEncoder().encode(text), byte => byte.toString(16).padStart(2, '0')).join(' ')
}

export function decodeHexText(text) {
  const clean = text.replace(/\s/g, '')
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('无效的 Hex 字符')
  }
  if (clean.length % 2 !== 0) {
    throw new Error('无效的 Hex 长度')
  }

  const bytes = new Uint8Array(clean.length / 2)
  for (let index = 0; index < clean.length; index += 2) {
    bytes[index / 2] = Number.parseInt(clean.slice(index, index + 2), 16)
  }
  return utf8Decoder().decode(bytes)
}

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const base32PaddingByRemainder = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 }
const base32UnusedBitsByRemainder = { 2: 2, 4: 4, 5: 1, 7: 3 }

export function encodeBase32(text) {
  const bytes = new TextEncoder().encode(text)
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31]
  while (output.length % 8 !== 0) output += '='
  return output
}

export function decodeBase32(text) {
  const match = /^([A-Za-z2-7]*)(=*)$/.exec(text)
  if (!match) throw new Error('无效的 Base32 字符')

  const data = match[1].toUpperCase()
  const padding = match[2].length
  const remainder = data.length % 8
  if (!Object.prototype.hasOwnProperty.call(base32PaddingByRemainder, remainder)) {
    throw new Error('无效的 Base32 长度')
  }

  const expectedPadding = base32PaddingByRemainder[remainder]
  if (padding !== 0 && padding !== expectedPadding) {
    throw new Error('无效的 Base32 padding')
  }

  const unusedBits = base32UnusedBitsByRemainder[remainder] || 0
  if (unusedBits > 0) {
    const lastValue = base32Alphabet.indexOf(data[data.length - 1])
    if ((lastValue & ((1 << unusedBits) - 1)) !== 0) {
      throw new Error('无效的 Base32 填充位')
    }
  }

  let bits = 0
  let value = 0
  const bytes = []
  for (const character of data) {
    value = (value << 5) | base32Alphabet.indexOf(character)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }

  return utf8Decoder().decode(new Uint8Array(bytes))
}

const cEscapeMap = {
  '\n': '\\n', '\r': '\\r', '\t': '\\t',
  '\b': '\\b', '\f': '\\f', '\v': '\\v',
  '\\': '\\\\', '"': '\\"', "'": "\\'"
}
const cUnescapeMap = {
  n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v',
  '\\': '\\', '"': '"', "'": "'"
}

export function escapeC(text) {
  let output = ''
  for (const character of text) {
    output += cEscapeMap[character] ?? character
  }
  return output
}

export function unescapeC(text) {
  let output = ''
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character !== '\\' || index + 1 >= text.length) {
      output += character
      continue
    }

    const escaped = text[index + 1]
    if (Object.prototype.hasOwnProperty.call(cUnescapeMap, escaped)) {
      output += cUnescapeMap[escaped]
      index += 1
    } else {
      // 未知转义保持原样，不吞掉反斜杠。
      output += character
    }
  }
  return output
}

export function escapeUnicode(text) {
  let output = ''
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index)
    output += codeUnit > 0x7f
      ? `\\u${codeUnit.toString(16).padStart(4, '0')}`
      : text[index]
  }
  return output
}

export function unescapeUnicode(text) {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  )
}

export function escapeHex(text) {
  return Array.from(new TextEncoder().encode(text), byte => `\\x${byte.toString(16).padStart(2, '0')}`).join('')
}

export function unescapeHex(text) {
  return text.replace(/(?:\\x[0-9a-fA-F]{2})+/g, escapedRun => {
    const tokens = escapedRun.match(/\\x[0-9a-fA-F]{2}/g) || []
    const bytes = Uint8Array.from(tokens, token => Number.parseInt(token.slice(2), 16))
    return new TextDecoder().decode(bytes)
  })
}
