import { describe, expect, it } from 'vitest'
import {
  decodeBase32,
  decodeBase64ToUtf8,
  decodeHexText,
  encodeBase32,
  encodeHexText,
  encodeUtf8ToBase64,
  escapeC,
  escapeHex,
  escapeUnicode,
  unescapeC,
  unescapeHex,
  unescapeUnicode
} from '../src/utils/toolEncodings.js'

describe('Hex text encoding', () => {
  it('round-trips UTF-8 text and permits the encoder’s whitespace separators', () => {
    const original = 'Hex 编码 🚀'
    expect(decodeHexText(encodeHexText(original))).toBe(original)
    expect(decodeHexText('48 65\t6c6c6f')).toBe('Hello')
  })

  it('rejects non-hex characters and odd-length input instead of dropping data', () => {
    expect(() => decodeHexText('41G2')).toThrow(/Hex 字符/)
    expect(() => decodeHexText('4-1')).toThrow(/Hex 字符/)
    expect(() => decodeHexText('414')).toThrow(/Hex 长度/)
  })
})

describe('Base32', () => {
  it('round-trips UTF-8 text with RFC 4648 padding', () => {
    const original = 'Base32 测试 🚀'
    const encoded = encodeBase32(original)
    expect(encoded.length % 8).toBe(0)
    expect(decodeBase32(encoded)).toBe(original)
  })

  it('decodes valid padded and unpadded forms', () => {
    expect(decodeBase32('MY======')).toBe('f')
    expect(decodeBase32('MY')).toBe('f')
    expect(decodeBase32('MZXW6YQ=')).toBe('foob')
    expect(decodeBase32('MZXW6YQ')).toBe('foob')
  })

  it('rejects illegal symbols, misplaced padding, and incorrect padding counts', () => {
    for (const invalid of ['M*======', 'MZ======', 'MY=====', 'M=Y=====', 'MZXW6YQ==', 'MZXW6YTB=', 'MZXW6===x']) {
      expect(() => decodeBase32(invalid), invalid).toThrow()
    }
  })
})

describe('UTF-8 Base64', () => {
  it('round-trips Unicode in standard and URL-safe modes', () => {
    const original = 'Base64 文本 🚀'
    const standard = encodeUtf8ToBase64(original)
    const urlSafe = encodeUtf8ToBase64(original, true)
    expect(decodeBase64ToUtf8(standard)).toBe(original)
    expect(decodeBase64ToUtf8(urlSafe, true)).toBe(original)
    expect(urlSafe).not.toMatch(/[+/=]/)
  })

  it('rejects malformed Base64 and invalid UTF-8 byte sequences', () => {
    expect(() => decodeBase64ToUtf8('%%%')).toThrow(/Base64/)
    expect(() => decodeBase64ToUtf8('/w==')).toThrow(/Base64/)
  })
})

describe('Unicode and Hex escapes', () => {
  it('round-trips supplementary-plane characters using UTF-16 surrogate escapes', () => {
    const original = 'A🚀中'
    const escaped = escapeUnicode(original)
    expect(escaped).toContain('\\ud83d\\ude80')
    expect(unescapeUnicode(escaped)).toBe(original)
  })

  it('round-trips supplementary-plane characters in Hex escape mode', () => {
    const original = 'A🚀中'
    expect(unescapeHex(escapeHex(original))).toBe(original)
  })
})

describe('C-style escapes', () => {
  it('round-trips escaped characters and literal private-use sentinel characters', () => {
    const original = `slashes \\\\ \n\t \\\nquotes " ' sentinel \uE000 end`
    expect(unescapeC(escapeC(original))).toBe(original)
  })

  it('processes escapes left-to-right without corrupting backslash sequences', () => {
    expect(unescapeC('\\\\n')).toBe('\\n')
    expect(unescapeC('\\n')).toBe('\n')
    expect(unescapeC('\\q')).toBe('\\q')
    expect(unescapeC('trailing\\')).toBe('trailing\\')
  })
})
