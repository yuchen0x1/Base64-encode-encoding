const NAMED_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hsv', 'hsva'])

export const MAX_COLOR_HISTORY = 12
export const COLOR_HISTORY_STORAGE_KEY = 'geek-toolbox:color-history'

const WHITE = Object.freeze({ r: 255, g: 255, b: 255, a: 1 })

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeHue(value) {
  const hue = ((value % 360) + 360) % 360
  return Object.is(hue, -0) ? 0 : hue
}

function normalizeAlpha(value) {
  return round(clamp(value, 0, 1), 3)
}

function parseDecimal(token, label) {
  const text = String(token ?? '').trim()
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    throw new Error(`${label}必须是数字`)
  }
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error(`${label}必须是有限数字`)
  return value
}

function parsePercentage(token, label) {
  const text = String(token ?? '').trim()
  const percent = text.endsWith('%')
  const value = parseDecimal(percent ? text.slice(0, -1) : text, label)
  if (value < 0 || value > 100) throw new Error(`${label}必须在 0–100 之间`)
  return percent ? value : value
}

function parseHue(token) {
  const text = String(token ?? '').trim().replace(/deg$/i, '').replace(/°$/, '')
  const value = parseDecimal(text, '色相')
  if (value < 0 || value > 360) throw new Error('色相必须在 0–360 之间')
  return value === 360 ? 0 : value
}

function parseRgbChannel(token, label) {
  const text = String(token ?? '').trim()
  if (text.endsWith('%')) {
    const value = parseDecimal(text.slice(0, -1), label)
    if (value < 0 || value > 100) throw new Error(`${label}百分比必须在 0–100 之间`)
    return Math.round((value * 255) / 100)
  }
  const value = parseDecimal(text, label)
  if (value < 0 || value > 255) throw new Error(`${label}必须在 0–255 之间`)
  return Math.round(value)
}

function parseAlpha(token) {
  if (token === undefined || token === null || String(token).trim() === '') return 1
  const text = String(token).trim()
  if (text.endsWith('%')) {
    const value = parseDecimal(text.slice(0, -1), '透明度')
    if (value < 0 || value > 100) throw new Error('透明度百分比必须在 0–100 之间')
    return normalizeAlpha(value / 100)
  }
  const value = parseDecimal(text, '透明度')
  if (value < 0 || value > 1) throw new Error('透明度必须在 0–1 之间')
  return normalizeAlpha(value)
}

function splitFunctionArguments(inner) {
  const slashParts = inner.split('/')
  if (slashParts.length > 2) throw new Error('颜色函数只能包含一个透明度分隔符 /')

  const main = slashParts[0].trim()
  if (!main) throw new Error('颜色函数缺少通道值')

  const parts = main.includes(',')
    ? main.split(',').map(part => part.trim())
    : main.split(/\s+/).filter(Boolean)
  let alpha = slashParts[1]?.trim()

  if (parts.length === 4) {
    if (alpha !== undefined) throw new Error('透明度不能同时使用逗号和 / 分隔')
    alpha = parts.pop()
  }
  if (parts.length !== 3) throw new Error('颜色函数需要 3 个颜色通道')

  return { parts, alpha }
}

function parseHex(input) {
  const hex = input.replace(/^#/, '')
  if (!/^[0-9a-f]+$/i.test(hex)) throw new Error('HEX 只能包含 0–9 和 A–F')
  if (![3, 4, 6, 8].includes(hex.length)) throw new Error('HEX 长度必须是 3、4、6 或 8 位')

  const expanded = hex.length <= 4
    ? Array.from(hex, character => character + character).join('')
    : hex
  const channel = offset => Number.parseInt(expanded.slice(offset, offset + 2), 16)
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: expanded.length === 8 ? normalizeAlpha(channel(6) / 255) : 1
  }
}

/**
 * Parse a local-only color value. Supported syntaxes:
 * #RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb(a), hsl(a), hsv(a), comma or space based.
 */
export function tryParseColor(input) {
  if (typeof input !== 'string') {
    return { ok: false, error: '颜色值必须是字符串' }
  }
  const raw = input.trim()
  if (!raw) return { ok: false, error: '请输入颜色值' }

  try {
    if (raw.startsWith('#') || /^[0-9a-f]{3,8}$/i.test(raw)) {
      return { ok: true, color: { ...parseHex(raw), format: 'hex' } }
    }

    const match = raw.match(/^([a-z]+)\((.*)\)$/i)
    if (!match) throw new Error('支持 #HEX、rgb()、rgba()、hsl()、hsla()、hsv() 或 hsva()')

    const name = match[1].toLowerCase()
    if (!NAMED_FUNCTIONS.has(name)) throw new Error(`不支持的颜色函数 ${match[1]}()`)
    const { parts, alpha } = splitFunctionArguments(match[2])

    if (name === 'rgb' || name === 'rgba') {
      return {
        ok: true,
        color: {
          r: parseRgbChannel(parts[0], '红通道'),
          g: parseRgbChannel(parts[1], '绿通道'),
          b: parseRgbChannel(parts[2], '蓝通道'),
          a: parseAlpha(alpha),
          format: name
        }
      }
    }

    const hue = parseHue(parts[0])
    const second = parsePercentage(parts[1], '饱和度')
    const third = parsePercentage(parts[2], name.startsWith('hsl') ? '亮度' : '明度')
    const parsed = name.startsWith('hsl')
      ? hslToRgb({ h: hue, s: second, l: third, a: parseAlpha(alpha) })
      : hsvToRgb({ h: hue, s: second, v: third, a: parseAlpha(alpha) })
    return { ok: true, color: { ...parsed, format: name } }
  } catch (error) {
    return { ok: false, error: error.message || '无效的颜色值' }
  }
}

export function parseColor(input) {
  const result = tryParseColor(input)
  return result.ok ? result.color : null
}

export function normalizeColor(color) {
  if (!color || typeof color !== 'object') throw new TypeError('颜色对象无效')
  for (const key of ['r', 'g', 'b']) {
    if (!Number.isFinite(color[key])) throw new TypeError(`${key} 通道必须是有限数字`)
  }
  return {
    r: Math.round(clamp(color.r, 0, 255)),
    g: Math.round(clamp(color.g, 0, 255)),
    b: Math.round(clamp(color.b, 0, 255)),
    a: normalizeAlpha(Number.isFinite(color.a) ? color.a : 1)
  }
}

export function rgbToHsl(color) {
  const normalized = normalizeColor(color)
  const { r, g, b } = normalized
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const delta = max - min
  let hue = 0
  let saturation = 0

  if (delta !== 0) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue /= 6
  }

  return {
    h: round(normalizeHue(hue * 360), 2),
    s: round(saturation * 100, 2),
    l: round(lightness * 100, 2),
    a: normalized.a
  }
}

export function hslToRgb(color) {
  const hue = normalizeHue(color.h)
  const saturation = clamp(color.s, 0, 100) / 100
  const lightness = clamp(color.l, 0, 100) / 100
  const alpha = normalizeAlpha(Number.isFinite(color.a) ? color.a : 1)

  if (saturation === 0) {
    const channel = Math.round(lightness * 255)
    return { r: channel, g: channel, b: channel, a: alpha }
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q
  const hueToChannel = t => {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
  }
  const normalizedHue = hue / 360
  return {
    r: Math.round(hueToChannel(normalizedHue + 1 / 3) * 255 + 1e-9),
    g: Math.round(hueToChannel(normalizedHue) * 255 + 1e-9),
    b: Math.round(hueToChannel(normalizedHue - 1 / 3) * 255 + 1e-9),
    a: alpha
  }
}

export function rgbToHsv(color) {
  const normalized = normalizeColor(color)
  const { r, g, b } = normalized
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let hue = 0

  if (delta !== 0) {
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue /= 6
  }

  return {
    h: round(normalizeHue(hue * 360), 2),
    s: round(max === 0 ? 0 : (delta / max) * 100, 2),
    v: round(max * 100, 2),
    a: normalized.a
  }
}

export function hsvToRgb(color) {
  const hue = normalizeHue(color.h)
  const saturation = clamp(color.s, 0, 100) / 100
  const value = clamp(color.v, 0, 100) / 100
  const alpha = normalizeAlpha(Number.isFinite(color.a) ? color.a : 1)

  const chroma = value * saturation
  const sector = hue / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  let red = 0
  let green = 0
  let blue = 0
  void red
  void green
  void blue

  if (sector < 1) [red, green, blue] = [chroma, x, 0]
  else if (sector < 2) [red, green, blue] = [x, chroma, 0]
  else if (sector < 3) [red, green, blue] = [0, chroma, x]
  else if (sector < 4) [red, green, blue] = [0, x, chroma]
  else if (sector < 5) [red, green, blue] = [x, 0, chroma]
  else [red, green, blue] = [chroma, 0, x]

  const match = value - chroma
  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
    a: alpha
  }
}

function formatNumber(value) {
  return String(round(value, 2))
}

export function formatHex(color, { alpha = false, uppercase = true } = {}) {
  const normalized = normalizeColor(color)
  const parts = [normalized.r, normalized.g, normalized.b].map(channel =>
    channel.toString(16).padStart(2, '0')
  )
  if (alpha || normalized.a < 1) {
    parts.push(Math.round(normalized.a * 255).toString(16).padStart(2, '0'))
  }
  const value = `#${parts.join('')}`
  return uppercase ? value.toUpperCase() : value
}

export function formatRgb(color, { alpha = false } = {}) {
  const normalized = normalizeColor(color)
  if (alpha || normalized.a < 1) {
    return `rgba(${normalized.r}, ${normalized.g}, ${normalized.b}, ${formatNumber(normalized.a)})`
  }
  return `rgb(${normalized.r}, ${normalized.g}, ${normalized.b})`
}

export function formatHsl(color, { alpha = false } = {}) {
  const hsl = rgbToHsl(color)
  const channels = `${formatNumber(hsl.h)}, ${formatNumber(hsl.s)}%, ${formatNumber(hsl.l)}%`
  return alpha || hsl.a < 1
    ? `hsla(${channels}, ${formatNumber(hsl.a)})`
    : `hsl(${channels})`
}

export function formatHsv(color, { alpha = false } = {}) {
  const hsv = rgbToHsv(color)
  const channels = `${formatNumber(hsv.h)}, ${formatNumber(hsv.s)}%, ${formatNumber(hsv.v)}%`
  return alpha || hsv.a < 1
    ? `hsva(${channels}, ${formatNumber(hsv.a)})`
    : `hsv(${channels})`
}

export function getColorFormats(color) {
  const normalized = normalizeColor(color)
  return [
    { label: 'HEX', value: formatHex(normalized, { alpha: normalized.a < 1 }) },
    { label: 'RGB', value: formatRgb(normalized) },
    { label: 'RGBA', value: formatRgb(normalized, { alpha: true }) },
    { label: 'HSL', value: formatHsl(normalized) },
    { label: 'HSLA', value: formatHsl(normalized, { alpha: true }) },
    { label: 'HSV', value: formatHsv(normalized) },
    { label: 'HSVA', value: formatHsv(normalized, { alpha: true }) },
    { label: 'CSS var', value: `--color: ${formatHex(normalized, { alpha: normalized.a < 1 }).toLowerCase()};` }
  ]
}

function compositeOver(foreground, background) {
  const fg = normalizeColor(typeof foreground === 'string' ? parseColor(foreground) : foreground)
  const bg = normalizeColor(typeof background === 'string' ? parseColor(background) : background)
  const alpha = fg.a + bg.a * (1 - fg.a)
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 1 }
  return {
    r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha),
    g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha),
    b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha),
    a: round(alpha, 3)
  }
}

export function relativeLuminance(color) {
  const normalized = normalizeColor(color)
  const toLinear = channel => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(normalized.r) + 0.7152 * toLinear(normalized.g) + 0.0722 * toLinear(normalized.b)
}

export function contrastRatio(foreground, background) {
  const opaqueBackground = compositeOver(background, WHITE)
  const opaqueForeground = compositeOver(foreground, opaqueBackground)
  const first = relativeLuminance(opaqueForeground)
  const second = relativeLuminance(opaqueBackground)
  return round((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05), 2)
}

export function contrastRating(ratio) {
  if (ratio >= 7) return { label: 'AAA', level: 'excellent' }
  if (ratio >= 4.5) return { label: 'AA', level: 'good' }
  if (ratio >= 3) return { label: 'AA Large', level: 'large-only' }
  return { label: '不达标', level: 'fail' }
}

export function isLightColor(color) {
  return relativeLuminance(color) > 0.45
}

export function pushColorHistory(history, color, max = MAX_COLOR_HISTORY) {
  const current = Array.isArray(history) ? history : []
  const hex = formatHex(color, { alpha: normalizeColor(color).a < 1 })
  const normalized = hex.toLowerCase()
  return [
    hex,
    ...current.filter(item => typeof item === 'string' && item.toLowerCase() !== normalized)
  ].slice(0, Math.max(0, max))
}

export function sanitizeColorHistory(value, max = MAX_COLOR_HISTORY) {
  if (!Array.isArray(value)) return []
  const limit = Math.max(0, Math.floor(Number.isFinite(max) ? max : MAX_COLOR_HISTORY))
  if (!limit) return []
  const result = []
  const seen = new Set()
  for (const item of value) {
    const color = parseColor(item)
    if (!color) continue
    const hex = formatHex(color, { alpha: color.a < 1 })
    const key = hex.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(hex)
    if (result.length >= limit) break
  }
  return result
}

function storageOrNull(storage) {
  if (storage) return storage
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

export function loadColorHistory(storage) {
  const target = storageOrNull(storage)
  if (!target) return []
  try {
    return sanitizeColorHistory(JSON.parse(target.getItem(COLOR_HISTORY_STORAGE_KEY) || '[]'))
  } catch {
    return []
  }
}

export function saveColorHistory(history, storage) {
  const target = storageOrNull(storage)
  const safe = sanitizeColorHistory(history)
  if (!target) return safe
  try {
    target.setItem(COLOR_HISTORY_STORAGE_KEY, JSON.stringify(safe))
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
  return safe
}
