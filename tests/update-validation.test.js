import { describe, expect, it } from 'vitest'
import {
  assertSupportedInstallerPackage,
  isValidSha256,
  isValidAuthenticodeThumbprint,
  normalizeSignatureMetadata
} from '../electron/update-validation.js'

const validPackage = {
  kind: 'http',
  url: 'https://updates.example.test/GeekToolbox-Setup-1.2.3.exe',
  sha256: 'a'.repeat(64)
}

describe('update package validation', () => {
  it('accepts an exact 64-character hexadecimal SHA-256 (case-insensitive)', () => {
    expect(isValidSha256('a'.repeat(64))).toBe(true)
    expect(isValidSha256('A'.repeat(64))).toBe(true)
  })

  it.each([
    ['missing hash', undefined],
    ['empty hash', ''],
    ['short hash', 'a'.repeat(63)],
    ['long hash', 'a'.repeat(65)],
    ['non-hex hash', `${'a'.repeat(63)}g`],
    ['non-string hash', 123]
  ])('rejects %s', (_label, sha256) => {
    expect(isValidSha256(sha256)).toBe(false)
    expect(() => assertSupportedInstallerPackage({ ...validPackage, sha256 }, 'nsis', 'win32'))
      .toThrow(/package\.sha256.*64/)
  })

  it('only accepts Windows NSIS executable packages', () => {
    expect(() => assertSupportedInstallerPackage(validPackage, 'nsis', 'win32')).not.toThrow()
    expect(() => assertSupportedInstallerPackage(validPackage, 'zip', 'win32')).toThrow(/NSIS/)
    expect(() => assertSupportedInstallerPackage({ ...validPackage, url: 'https://updates.example.test/update.zip' }, 'nsis', 'win32'))
      .toThrow(/\.exe/)
    expect(() => assertSupportedInstallerPackage(validPackage, 'nsis', 'darwin')).toThrow(/Windows/)
  })

  it('validates optional Authenticode metadata without pretending unsigned packages are signed', () => {
    const thumbprint = 'ab'.repeat(20)
    expect(isValidAuthenticodeThumbprint(thumbprint)).toBe(true)
    expect(normalizeSignatureMetadata({ type: 'authenticode', thumbprint: ` ${thumbprint.slice(0, 20)} ${thumbprint.slice(20)} ` }))
      .toMatchObject({ type: 'authenticode', thumbprint: thumbprint.toUpperCase() })
    expect(normalizeSignatureMetadata(undefined)).toBeNull()
    expect(() => normalizeSignatureMetadata({ type: 'authenticode', thumbprint: 'bad' }))
      .toThrow(/thumbprint.*40/)
    expect(() => assertSupportedInstallerPackage({ ...validPackage, signature: { type: 'other', thumbprint } }, 'nsis', 'win32'))
      .toThrow(/Authenticode/)
  })
})
