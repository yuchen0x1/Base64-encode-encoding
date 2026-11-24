import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  formatHex,
  formatHsl,
  formatHsv,
  formatRgb,
  getColorFormats,
  hslToRgb,
  hsvToRgb,
  parseColor,
  pushColorHistory,
  relativeLuminance,
  rgbToHsl,
  rgbToHsv,
  sanitizeColorHistory,
  tryParseColor
} from '../src/utils/color.js'

describe('color parsing', () => {
  it('parses HEX with optional alpha and all supported CSS functions', () => {
    expect(tryParseColor('#38bdf8')).toEqual({ ok: true, color: { r: 56, g: 189, b: 248, a: 1, format: 'hex' } })
    expect(tryParseColor('#F008')).toEqual({ ok: true, color: { r: 255, g: 0, b: 0, a: 0.533, format: 'hex' } })
    expect(tryParseColor('rgb(1 2 3 / 50%)')).toEqual({ ok: true, color: { r: 1, g: 2, b: 3, a: 0.5, format: 'rgb' } })
    expect(tryParseColor('rgba(255, 0, 0, .25)')).toEqual({ ok: true, color: { r: 255, g: 0, b: 0, a: 0.25, format: 'rgba' } })
    expect(tryParseColor('hsl(210 100% 50%)')).toEqual({ ok: true, color: { r: 0, g: 128, b: 255, a: 1, format: 'hsl' } })
    expect(tryParseColor('hsla(210, 100%, 50%, .5)')).toEqual({ ok: true, color: { r: 0, g: 128, b: 255, a: 0.5, format: 'hsla' } })
    expect(tryParseColor('hsv(0, 100%, 100%)')).toEqual({ ok: true, color: { r: 255, g: 0, b: 0, a: 1, format: 'hsv' } })
    expect(tryParseColor('hsva(0, 100%, 100%, 50%)')).toEqual({ ok: true, color: { r: 255, g: 0, b: 0, a: 0.5, format: 'hsva' } })
  })

  it('rejects invalid values without throwing', () => {
    expect(tryParseColor('')).toEqual({ ok: false, error: '请输入颜色值' })
    expect(tryParseColor('red')).toEqual({ ok: false, error: '支持 #HEX、rgb()、rgba()、hsl()、hsla()、hsv() 或 hsva()' })
    expect(tryParseColor('rgb(256, 0, 0)')).toEqual({ ok: false, error: '红通道必须在 0–255 之间' })
    expect(tryParseColor('#12')).toEqual({ ok: false, error: 'HEX 长度必须是 3、4、6 或 8 位' })
  })
})

describe('bidirectional color conversion', () => {
  it('round-trips RGB through HSL and HSV', () => {
    const source = { r: 24, g: 144, b: 255, a: 1 }
    expect(hslToRgb(rgbToHsl(source))).toEqual(source)
    expect(hsvToRgb(rgbToHsv(source))).toEqual(source)
  })

  it('formats RGB into every required representation', () => {
    expect(formatRgb({ r: 1, g: 2, b: 3 })).toBe('rgb(1, 2, 3)')
    expect(formatHsl({ r: 1, g: 2, b: 3 })).toBe('hsl(210, 50%, 0.78%)')
    expect(formatHsv({ r: 1, g: 2, b: 3 })).toBe('hsv(210, 66.67%, 1.18%)')
    expect(getColorFormats({ r: 1, g: 2, b: 3 }).map(item => item.label)).toEqual([
      'HEX', 'RGB', 'RGBA', 'HSL', 'HSLA', 'HSV', 'HSVA', 'CSS var'
    ])
  })

  it('maintains deterministic alpha formatting and history de-duplication', () => {
    expect(formatHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080')
    expect(sanitizeColorHistory(['#111111', '#111111', 'nope'])).toEqual(['#111111'])
    expect(sanitizeColorHistory(['#111111'], 0)).toEqual([])
    expect(pushColorHistory(['#222222'], { r: 17, g: 17, b: 17 })).toEqual(['#111111', '#222222'])
  })
})

describe('accessibility helpers', () => {
  it('calculates WCAG contrast over alpha compositing', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1)
    expect(contrastRatio(parseColor('#ffffff'), parseColor('#000000'))).toBe(21)
    expect(contrastRatio({ r: 0, g: 0, b: 0, a: 0 }, parseColor('#ffffff'))).toBe(1)
  })
})

describe('parseColor compatibility', () => {
  it('returns null for invalid input and colors for valid input', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1, format: 'rgb' })
    expect(parseColor('not-a-color')).toBeNull()
  })
})
