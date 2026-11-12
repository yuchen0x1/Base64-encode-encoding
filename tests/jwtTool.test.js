import { describe, expect, it } from 'vitest'
import { getJwtClaims, getJwtStatus, parseJwt } from '../src/components/tools/jwtTool.js'

function encodeBase64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function token(header, payload, signature = 'c2ln') {
  return `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}.${signature}`
}

describe('JWT decoder helpers', () => {
  it('requires exactly three non-empty segments', () => {
    for (const value of ['a.b', 'a.b.c.d', '.b.c', 'a..c', 'a.b.']) {
      expect(parseJwt(value).valid, value).toBe(false)
    }
    expect(parseJwt(token({ alg: 'HS256' }, {})).valid).toBe(true)
  })

  it('marks malformed base64url alphabet and impossible segment lengths invalid', () => {
    const valid = token({}, {})
    const [header, payload, signature] = valid.split('.')
    for (const invalidHeader of [`${header}=`, `${header}+`, 'a']) {
      expect(parseJwt(`${invalidHeader}.${payload}.${signature}`).valid).toBe(false)
    }
  })

  it('accepts only object headers and payloads', () => {
    expect(parseJwt(token(null, {})).valid).toBe(false)
    expect(parseJwt(token([], {})).valid).toBe(false)
    expect(parseJwt(token({}, null)).valid).toBe(false)
    expect(parseJwt(token({}, 0)).valid).toBe(false)
    expect(parseJwt(token({}, [])).valid).toBe(false)
  })

  it('labels statuses as parse-only and prioritizes future nbf over expired exp', () => {
    const nowMs = 1_700_000_000_000
    const parsed = parseJwt(token({}, { nbf: nowMs / 1000 + 100, exp: nowMs / 1000 - 100 }))
    const status = getJwtStatus(parsed, nowMs)
    expect(status.notYetValid).toBe(true)
    expect(status.expired).toBe(false)
    expect(status.text).toContain('尚未生效')
    expect(status.text).toContain('仅解析，不验签')
  })

  it('treats numeric exp and nbf zero as present claims', () => {
    const parsed = parseJwt(token({}, { exp: 0, nbf: 0 }))
    const status = getJwtStatus(parsed, 0)
    expect(status.expired).toBe(true)
    expect(getJwtClaims(parsed.payload, 0).map(claim => claim.key)).toEqual(['nbf', 'exp'])
  })

  it('does not interpret strings, booleans, or null as numeric time claims', () => {
    const parsed = parseJwt(token({}, { exp: '0', nbf: false, iat: null }))
    expect(getJwtStatus(parsed, 1000).text).toContain('未声明过期时间')
    expect(getJwtClaims(parsed.payload, 1000)).toEqual([])
  })
})
