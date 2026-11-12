import { describe, expect, it } from 'vitest'
import CryptoJS from 'crypto-js'
import { signJwtHs256, decodeBase64UrlJsonPart } from '../src/components/tools/jwtGeneratorTool.js'

function generate(options = {}) {
  return signJwtHs256({
    headerJson: JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    payloadJson: JSON.stringify({ sub: 'user-1' }),
    secret: 'test-secret',
    expirySeconds: 3600,
    nowSeconds: 1_700_000_000,
    ...options
  })
}

describe('JWT generator helpers', () => {
  it('only signs headers that declare HS256', () => {
    for (const alg of ['HS512', 'none', undefined]) {
      const result = generate({ headerJson: JSON.stringify({ alg }) })
      expect(result.ok).toBe(false)
      expect(result.error).toContain('HS256')
    }

    const result = generate()
    expect(result.ok).toBe(true)
    const [headerPart, payloadPart, signature] = result.token.split('.')
    expect(decodeBase64UrlJsonPart(headerPart).alg).toBe('HS256')
    const expected = CryptoJS.HmacSHA256(`${headerPart}.${payloadPart}`, 'test-secret')
      .toString(CryptoJS.enc.Base64)
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(signature).toBe(expected)
  })

  it('requires object JSON header and payload', () => {
    expect(generate({ headerJson: 'null' })).toMatchObject({ ok: false })
    expect(generate({ headerJson: '[]' })).toMatchObject({ ok: false })
    expect(generate({ payloadJson: 'null' })).toMatchObject({ ok: false })
    expect(generate({ payloadJson: '0' })).toMatchObject({ ok: false })
    expect(generate({ payloadJson: '[]' })).toMatchObject({ ok: false })
    expect(generate({ payloadJson: '{' })).toMatchObject({ ok: false })
  })

  it('preserves an explicit iat of zero and applies expiry deterministically', () => {
    const result = generate({ payloadJson: '{"iat":0}', expirySeconds: 10 })
    expect(result.ok).toBe(true)
    const [, payloadPart] = result.token.split('.')
    const payload = decodeBase64UrlJsonPart(payloadPart)
    expect(payload.iat).toBe(0)
    expect(payload.exp).toBe(1_700_000_010)
  })
})
