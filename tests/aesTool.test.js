import { describe, expect, it } from 'vitest'
import { parseCiphertext, validateAesParameters } from '../src/components/tools/aesTool.js'

describe('AES tool helpers', () => {
  it('validates AES key and IV using UTF-8 byte lengths', () => {
    for (const key of ['0123456789abcdef', '0123456789abcdefghijklmn', '0123456789abcdefghijklmnopqrstuv']) {
      expect(validateAesParameters({ key, iv: '0123456789abcdef', mode: 'CBC' }).valid).toBe(true)
    }
    expect(validateAesParameters({ key: '短密钥', iv: '0123456789abcdef', mode: 'CBC' }).error)
      .toContain('UTF-8 长度必须为 16、24 或 32 字节')
    expect(validateAesParameters({ key: '123456789012345', iv: '0123456789abcdef', mode: 'CBC' }).valid)
      .toBe(false)
    expect(validateAesParameters({ key: '0123456789abcdef', iv: '短IV', mode: 'CFB' }).error)
      .toContain('IV 的 UTF-8 长度必须为 16 字节')
    expect(validateAesParameters({ key: '0123456789abcdef', iv: '', mode: 'ECB' }).valid).toBe(true)
    expect(validateAesParameters({ key: '0123456789abcdef', iv: '123', mode: 'CBC' }).valid).toBe(false)
  })

  it('rejects malformed ciphertext instead of silently parsing partial input', () => {
    expect(() => parseCiphertext('abc', 'Hex')).toThrow('Hex 密文格式无效')
    expect(() => parseCiphertext('12xz', 'Hex')).toThrow('Hex 密文格式无效')
    expect(() => parseCiphertext('not base64', 'Base64')).toThrow('Base64 密文格式无效')
    expect(() => parseCiphertext('YWJj*', 'Base64')).toThrow('Base64 密文格式无效')
    expect(parseCiphertext(`${'A'.repeat(22)}==`, 'Base64')).toBe(`${'A'.repeat(22)}==`)
    expect(parseCiphertext('00'.repeat(16), 'Hex')).toBe('00'.repeat(16))
  })
})
