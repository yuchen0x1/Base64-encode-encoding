import { describe, expect, it, vi } from 'vitest'
import {
  createQrDataUrl,
  formatRadixValue,
  getUniqueFileReferences,
  imageExtensionForMime,
  parseImageDataUrl,
  parseRadixValue,
  splitBatchLines
} from '../src/utils/toolHelpers.js'

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

describe('splitBatchLines', () => {
  it('splits CRLF input without leaving carriage returns and preserves empty lines', () => {
    expect(splitBatchLines('first\r\nsecond\r\n\r\nlast\n')).toEqual([
      'first',
      'second',
      '',
      'last',
      ''
    ])
  })
})

describe('getUniqueFileReferences', () => {
  it('deduplicates the same File reference while retaining a distinct same-name, same-size file', () => {
    const existingFile = new File(['first!'], 'notes.txt', { type: 'text/plain', lastModified: 1 })
    const distinctFile = new File(['second'], 'notes.txt', { type: 'text/plain', lastModified: 1 })

    expect(distinctFile).not.toBe(existingFile)
    expect(distinctFile.name).toBe(existingFile.name)
    expect(distinctFile.size).toBe(existingFile.size)
    expect(distinctFile.lastModified).toBe(existingFile.lastModified)

    expect(getUniqueFileReferences(
      [existingFile],
      [existingFile, existingFile, distinctFile, distinctFile]
    )).toEqual([distinctFile])
  })
})

describe('image DataURL helpers', () => {
  it('detects the MIME type from image bytes rather than trusting the DataURL label', () => {
    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const payload = bytesToBase64(pngBytes)

    expect(parseImageDataUrl(`data:image/jpeg;base64,${payload}`)).toEqual({
      mimeType: 'image/png',
      base64: payload,
      dataUrl: `data:image/png;base64,${payload}`
    })
  })

  it('rejects payloads that do not contain a recognized image format', () => {
    expect(parseImageDataUrl('data:text/plain;base64,SGVsbG8=')).toBeNull()
    expect(parseImageDataUrl('not an image')).toBeNull()
  })

  it('maps supported image MIME types to extensions and uses img as the fallback', () => {
    const extensions = {
      'image/avif': 'avif',
      'image/bmp': 'bmp',
      'image/gif': 'gif',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
      'image/x-icon': 'ico'
    }

    for (const [mimeType, extension] of Object.entries(extensions)) {
      expect(imageExtensionForMime(mimeType)).toBe(extension)
    }
    expect(imageExtensionForMime('IMAGE/JPEG')).toBe('jpg')
    expect(imageExtensionForMime('application/octet-stream')).toBe('img')
  })
})

describe('radix value helpers', () => {
  it.each([2, 8, 10, 16])('round-trips negative BigInt values in base %i', (radix) => {
    const original = -12345678901234567890n
    const formatted = formatRadixValue(original, radix)

    expect(formatted.startsWith('-')).toBe(true)
    expect(parseRadixValue(formatted, radix)).toBe(original)
  })
})

describe('createQrDataUrl', () => {
  it('returns an empty string when the asynchronous generator fails so stale data is cleared', async () => {
    const error = new Error('QR generation failed')
    const generator = vi.fn().mockRejectedValue(error)
    const onError = vi.fn()
    const previousDataUrl = 'data:image/png;base64,stale-value'

    const result = await createQrDataUrl('new content', {}, generator, onError)

    expect(generator).toHaveBeenCalledOnce()
    expect(result).toBe('')
    expect(result).not.toBe(previousDataUrl)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(error)
  })
})
