import { describe, expect, it } from 'vitest'
import { calculateHashResults, PRIMARY_ROW_BY_ALGORITHM } from '../src/components/tools/hashHelpers.js'

describe('calculateHashResults', () => {
  it('returns standard digest vectors for abc', () => {
    const { hashes } = calculateHashResults({ input: 'abc' })
    const valuesById = Object.fromEntries(hashes.map(({ id, val }) => [id, val]))

    expect(valuesById).toMatchObject({
      'MD5-SHORT': '3cd24fb0d6963f7d',
      MD5: '900150983cd24fb0d6963f7d28e17f72',
      SHA1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
      SHA256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      SHA512: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
        '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    })
  })

  it('maps every selected algorithm to its matching primary matrix row', () => {
    const expectedValues = {
      MD5: '900150983cd24fb0d6963f7d28e17f72',
      SHA1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
      SHA256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      SHA512: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
        '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      'HMAC-SHA256': 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
    }
    const expectedNames = {
      MD5: 'MD5 (32位完整摘要)',
      SHA1: 'SHA-1 (40位安全指纹)',
      SHA256: 'SHA-256 (64位密码级)',
      SHA512: 'SHA-512 (128位超强摘要)',
      'HMAC-SHA256': 'HMAC-SHA256 (密钥签名)'
    }

    for (const [algorithm, expectedValue] of Object.entries(expectedValues)) {
      const result = calculateHashResults({
        input: algorithm === 'HMAC-SHA256' ? 'The quick brown fox jumps over the lazy dog' : 'abc',
        algorithm,
        secretKey: 'key'
      })
      const primaryMatrixRow = result.hashes.find(({ id }) => id === PRIMARY_ROW_BY_ALGORITHM[algorithm])

      expect(result.selectedAlgorithm).toBe(algorithm)
      expect(result.primary).toEqual(primaryMatrixRow)
      expect(result.primary.name).toBe(expectedNames[algorithm])
      expect(result.primary.val).toBe(expectedValue)
    }
  })

  it('formats matrix and primary result consistently in uppercase', () => {
    const result = calculateHashResults({
      input: 'abc',
      algorithm: 'SHA256',
      letterCase: 'upper'
    })

    expect(result.primary.val).toBe('BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')
    expect(result.hashes.find(({ id }) => id === 'SHA256').val).toBe(result.primary.val)
    expect(result.hashes.every(({ val }) => val === val.toUpperCase())).toBe(true)
  })

  it('returns empty values for empty input while preserving selected row and algorithm', () => {
    const result = calculateHashResults({ input: '', algorithm: 'HMAC-SHA256' })

    expect(result.hashes).toHaveLength(6)
    expect(result.hashes.every(({ val }) => val === '')).toBe(true)
    expect(result.primary.id).toBe('HMAC-SHA256')
    expect(result.selectedAlgorithm).toBe('HMAC-SHA256')
  })

  it('only calculates HMAC when HMAC-SHA256 is selected', () => {
    const normalResult = calculateHashResults({ input: 'abc', algorithm: 'MD5', secretKey: '' })
    const hmacResult = calculateHashResults({
      input: 'abc',
      algorithm: 'HMAC-SHA256',
      secretKey: 'secret'
    })

    expect(normalResult.hashes.find(({ id }) => id === 'HMAC-SHA256').val).toBe('')
    expect(hmacResult.primary.val).toBe('9946dad4e00e913fc8be8e5d3f7e110a4a9e832f83fb09c345285d78638d8a0e')
  })
})
