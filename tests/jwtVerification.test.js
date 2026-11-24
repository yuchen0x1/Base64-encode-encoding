import { describe, expect, it } from 'vitest'
import {
  createJwtHs256Sample,
  getJwtStatus,
  parseJwt,
  verifyJwtHs256
} from '../src/components/tools/jwtTool.js'

function encodePart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function unsignedToken(header, payload) {
  return `${encodePart(header)}.${encodePart(payload)}.c2ln`
}

describe('JWT HS256 local verification', () => {
  it('verifies a real HS256 token and reports decode and signature independently', async () => {
    const sample = await createJwtHs256Sample({ nowMs: 1_700_000_000_000 })
    const result = await verifyJwtHs256(sample.token, sample.secret)

    expect(result).toMatchObject({ status: 'verified', verified: true, algorithm: 'HS256' })
    expect(parseJwt(sample.token)).toMatchObject({ valid: true })
    const status = getJwtStatus(parseJwt(sample.token), 1_700_000_100_000, result)
    expect(status.expired).toBe(false)
    expect(status.text).toContain('签名有效')
  })

  it('fails verification with the wrong secret without invalidating JSON decoding', async () => {
    const sample = await createJwtHs256Sample()
    const result = await verifyJwtHs256(sample.token, 'wrong-secret')

    expect(parseJwt(sample.token).valid).toBe(true)
    expect(result).toMatchObject({ status: 'invalid-signature', verified: false })
    expect(result.error).toContain('不匹配')
  })

  it('rejects alg=none and any non-HS256 algorithm instead of treating decoding as trust', async () => {
    for (const alg of ['none', 'HS512', 'RS256']) {
      const result = await verifyJwtHs256(unsignedToken({ alg }, { sub: 'user' }), 'secret')
      expect(result.status).toBe('unsupported-algorithm')
      expect(result.verified).toBe(false)
    }
  })

  it('detects payload tampering while keeping the original signature', async () => {
    const sample = await createJwtHs256Sample()
    const [header, , signature] = sample.token.split('.')
    const tamperedPayload = encodePart({ sub: 'attacker', admin: true })
    const result = await verifyJwtHs256(`${header}.${tamperedPayload}.${signature}`, sample.secret)

    expect(result.status).toBe('invalid-signature')
    expect(result.verified).toBe(false)
  })

  it('supports Unicode and emoji claims and tokens without exp', async () => {
    const token = await createJwtHs256Sample({ secret: '中文密钥🚀' })
    expect((await verifyJwtHs256(token.token, '中文密钥🚀')).status).toBe('verified')

    const header = encodePart({ alg: 'HS256', typ: 'JWT' })
    const payload = encodePart({ sub: '用户🚀' })
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${payload}`))
    const unsigned = `${header}.${payload}.${Buffer.from(signature).toString('base64url')}`
    expect((await verifyJwtHs256(unsigned, 'secret')).status).toBe('verified')
    expect(getJwtStatus(parseJwt(unsigned)).text).toContain('未声明过期时间')
  })

  it('returns explicit states for missing secret, malformed tokens, and unsupported runtimes', async () => {
    const sample = await createJwtHs256Sample()
    expect((await verifyJwtHs256(sample.token, '')).status).toBe('missing-secret')
    expect((await verifyJwtHs256('not.a.jwt', 'secret')).status).toBe('invalid-format')
    expect((await verifyJwtHs256(sample.token, 'secret', { cryptoImpl: null })).status).toBe('unsupported-runtime')
    expect((await verifyJwtHs256(sample.token, 'x'.repeat(8193))).status).toBe('invalid-secret')
  })

  it('preserves the original parse-only claims contract for non-object and canonical inputs', async () => {
    for (const value of ['a.b', 'a.b.c.d', '.b.c', 'a..c', 'a.b.']) {
      expect(parseJwt(value).valid, value).toBe(false)
    }
    expect(parseJwt(unsignedToken({ alg: 'HS256' }, {})).valid).toBe(true)
    expect(parseJwt(unsignedToken(null, {})).valid).toBe(false)
    expect(parseJwt(unsignedToken({}, null)).valid).toBe(false)
    const nowMs = 1_700_000_000_000
    const status = getJwtStatus(
      parseJwt(unsignedToken({}, { nbf: nowMs / 1000 + 100, exp: nowMs / 1000 - 100 })),
      nowMs
    )
    expect(status.notYetValid).toBe(true)
    expect(status.expired).toBe(false)
    expect(status.text).toContain('仅解析，不验签')
  })
})
