import { describe, it, expect } from 'vitest'
import { parseVersion, compareVersions, isNewerVersion, normalizeVersion } from '../shared/version.js'

describe('parseVersion', () => {
  it('parses standard semver', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
  })
  it('strips a leading v', () => {
    expect(parseVersion('v1.2.3').major).toBe(1)
  })
  it('captures prerelease identifiers', () => {
    expect(parseVersion('1.2.3-beta.1').prerelease).toEqual(['beta', '1'])
  })
  it('returns null on garbage / wrong type', () => {
    expect(parseVersion('not-a-version')).toBeNull()
    expect(parseVersion(123)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compares major/minor/patch', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })
  it('orders releases above prereleases', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })
  it('throws on invalid input', () => {
    expect(() => compareVersions('x', '1.0.0')).toThrow()
  })
})

describe('isNewerVersion', () => {
  it('true when latest is newer', () => {
    expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true)
    expect(isNewerVersion('1.2.0', '1.2.0')).toBe(false)
  })
  it('false on invalid version', () => {
    expect(isNewerVersion('garbage', '1.2.0')).toBe(false)
  })
})

describe('normalizeVersion', () => {
  it('drops build metadata', () => {
    expect(normalizeVersion('1.2.3+build.5')).toBe('1.2.3')
  })
  it('keeps prerelease', () => {
    expect(normalizeVersion('1.2.3-beta.1')).toBe('1.2.3-beta.1')
  })
  it('falls back to trimmed raw on invalid', () => {
    expect(normalizeVersion('  ')).toBe('')
  })
})
