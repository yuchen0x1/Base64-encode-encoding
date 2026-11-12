export function splitBatchLines(value) {
  return String(value).split(/\r\n|\n|\r/)
}

export function getUniqueFileReferences(existingFiles, incomingFiles) {
  const seen = new Set(existingFiles)
  const uniqueFiles = []

  for (const file of Array.from(incomingFiles || [])) {
    if (seen.has(file)) continue
    seen.add(file)
    uniqueFiles.push(file)
  }

  return uniqueFiles
}

const IMAGE_EXTENSIONS = {
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-icon': 'ico'
}

function asciiAt(bytes, offset, length) {
  let value = ''
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    value += String.fromCharCode(bytes[i])
  }
  return value
}

function detectImageMime(bytes) {
  if (bytes.length >= 8 && asciiAt(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(asciiAt(bytes, 0, 6))) return 'image/gif'
  if (bytes.length >= 12 && asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') return 'image/webp'
  if (bytes.length >= 2 && asciiAt(bytes, 0, 2) === 'BM') return 'image/bmp'
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon'

  if (bytes.length >= 12 && asciiAt(bytes, 4, 4) === 'ftyp') {
    const brands = asciiAt(bytes, 8, Math.min(bytes.length - 8, 32))
    if (brands.includes('avif') || brands.includes('avis')) return 'image/avif'
  }

  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
    .replace(/^\uFEFF/, '')
    .trimStart()
  if (/^(?:<\?xml\b[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+svg\b[^>]*>\s*)?<svg(?:\s|>)/i.test(text)) {
    return 'image/svg+xml'
  }

  return ''
}

export function parseImageDataUrl(value) {
  const input = String(value ?? '').trim()
  if (!input) return null

  let payload = input
  if (/^data:/i.test(input)) {
    const comma = input.indexOf(',')
    if (comma < 0) return null
    const metadata = input.slice(5, comma).split(';')
    if (!metadata.slice(1).some((part) => part.toLowerCase() === 'base64')) return null
    payload = input.slice(comma + 1)
  }

  let base64 = payload.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) return null
  base64 = base64.replace(/=+$/, '')
  base64 += '='.repeat((4 - (base64.length % 4)) % 4)

  let binary
  try {
    binary = atob(base64)
  } catch {
    return null
  }
  if (!binary.length) return null

  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

  const mimeType = detectImageMime(bytes)
  if (!mimeType) return null

  return {
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`
  }
}

export function imageExtensionForMime(mimeType) {
  return IMAGE_EXTENSIONS[String(mimeType).toLowerCase()] || 'img'
}

const RADIX_PREFIXES = { 2: '0b', 8: '0o', 16: '0x' }
const RADIX_PATTERNS = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  16: /^[0-9a-f]+$/i
}

export function parseRadixValue(value, radix) {
  const input = String(value).trim()
  if (radix === 10) {
    if (!/^-?[0-9]+$/.test(input)) throw new TypeError('Invalid base-10 integer')
    return BigInt(input)
  }

  const prefix = RADIX_PREFIXES[radix]
  const pattern = RADIX_PATTERNS[radix]
  const negative = input.startsWith('-')
  const digits = negative ? input.slice(1) : input

  if (!prefix || !pattern || !pattern.test(digits)) {
    throw new TypeError(`Invalid base-${radix} integer`)
  }

  const magnitude = BigInt(prefix + digits)
  return negative ? -magnitude : magnitude
}

export function formatRadixValue(value, radix) {
  const formatted = BigInt(value).toString(radix)
  return radix === 16 ? formatted.toUpperCase() : formatted
}

export async function createQrDataUrl(input, options, generator, onError = () => {}) {
  if (!String(input).trim()) return ''

  try {
    return await generator(input, options)
  } catch (error) {
    onError(error)
    return ''
  }
}
