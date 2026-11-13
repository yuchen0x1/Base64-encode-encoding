import { describe, expect, it, vi } from 'vitest'
import { generateSecurePassword, generateUuidV4, PASSWORD_CHARACTER_SETS } from '../src/utils/randomTools.js'

function deterministicSource() {
  let sequence = 0
  return { getRandomValues: vi.fn(array => { for (let i = 0; i < array.length; i++) array[i] = sequence++; return array }) }
}
const allOptions = { length: 8, includeUpper: true, includeLower: true, includeNumbers: true, includeSymbols: true }

describe('secure random tool behavior', () => {
  it('includes every selected category even for the shortest password', () => {
    for (const length of [8, 20, 64]) {
      const password = generateSecurePassword({ ...allOptions, length }, deterministicSource())
      expect(password).toHaveLength(length)
      for (const characters of Object.values(PASSWORD_CHARACTER_SETS)) {
        expect([...password].some(char => characters.includes(char))).toBe(true)
      }
    }
  })

  it.each(Object.keys(PASSWORD_CHARACTER_SETS))('respects only %s being selected', selected => {
    const password = generateSecurePassword({ length: 32, [selected]: true }, deterministicSource())
    expect([...password].every(char => PASSWORD_CHARACTER_SETS[selected].includes(char))).toBe(true)
  })

  it('rejects no selected categories, invalid lengths and missing entropy', () => {
    expect(() => generateSecurePassword({ length: 20 }, deterministicSource())).toThrow('至少')
    for (const length of [0, 7, 65, 8.5, NaN]) expect(() => generateSecurePassword({ ...allOptions, length })).toThrow('8–64')
    expect(() => generateSecurePassword(allOptions, {})).toThrow('安全随机数')
  })

  it('rejects biased tail samples and bounds a broken entropy source', () => {
    const source = deterministicSource()
    source.getRandomValues.mockImplementationOnce(array => { array.fill(0xffffffff); return array })
    expect(generateSecurePassword({ length: 8, includeLower: true }, source)).toHaveLength(8)
    const broken = { getRandomValues: array => { array.fill(0xffffffff); return array } }
    expect(() => generateSecurePassword({ length: 8, includeLower: true }, broken)).toThrow('随机数生成失败')
  })

  it('falls back to secure bytes when randomUUID is unavailable', () => {
    const source = deterministicSource()
    const id = generateUuidV4(source)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(source.getRandomValues).toHaveBeenCalledOnce()
    expect(() => generateUuidV4({})).toThrow('安全随机数')
  })

  it('uses native UUID generation when available', () => {
    const source = { randomUUID: vi.fn(() => 'native-id') }
    expect(generateUuidV4(source)).toBe('native-id')
    expect(source.randomUUID).toHaveBeenCalledOnce()
  })
})
