import { describe, expect, it } from 'vitest'
import { parseUnixTimestamp } from '../src/utils/timestamp.js'

describe('Unix timestamp parsing', () => {
  it('accepts safe second and millisecond timestamps', () => {
    expect(parseUnixTimestamp('0', 's')).toMatchObject({ valid: true, milliseconds: 0 })
    expect(parseUnixTimestamp('1700000000000', 'ms')).toMatchObject({ valid: true, milliseconds: 1700000000000 })
  })

  it('rejects unsafe integer input before Date conversion', () => {
    expect(parseUnixTimestamp('9007199254740992', 'ms')).toEqual({
      valid: false,
      error: '时间戳超出安全整数范围'
    })
    expect(parseUnixTimestamp('9007199254741', 's')).toEqual({
      valid: false,
      error: '时间戳超出安全整数范围'
    })
  })

  it('rejects an unsupported unit instead of treating it as milliseconds', () => {
    expect(parseUnixTimestamp('1', 'minutes')).toEqual({
      valid: false,
      error: '不支持的时间戳单位'
    })
  })
})
