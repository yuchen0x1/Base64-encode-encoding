import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import {
  QR_FILE_LIMITS,
  createQrReader,
  decodeBase64ToUint8Array,
  normalizeQrResults,
  positionKey,
  qrResultsToCsv,
  qrResultsToJson,
  qrResultsToText
} from '../src/utils/qrDecoder.js'

function toBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

async function createQrPngBytes(text) {
  const dataUrl = await QRCode.toDataURL(text, { width: 256, margin: 2, errorCorrectionLevel: 'M' })
  return Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0))
}

describe('QR WASM data handling', () => {
  it('decodes standard and unpadded base64 to bytes', () => {
    const bytes = decodeBase64ToUint8Array('AAEC')
    expect(Array.from(bytes)).toEqual([0, 1, 2])
    expect(Array.from(decodeBase64ToUint8Array('AQI'))).toEqual([1, 2])
  })

  it('rejects malformed or empty WASM payloads before touching ZXing', () => {
    expect(() => decodeBase64ToUint8Array('AA!')).toThrow('WASM 数据无效')
    expect(() => decodeBase64ToUint8Array('')).toThrow('WASM 数据无效')
    expect(() => createQrReader({})).toThrow('二维码识别模块未初始化')
  })
})

describe('createQrReader', () => {
  it('initializes ZXing with inline binary and applies bounded reader options', async () => {
    const prepareZXingModule = vi.fn()
    const readBarcodesMock = vi.fn().mockResolvedValue([
      {
        text: 'first',
        format: 'QRCode',
        position: {
          topLeft: { x: 10.2, y: 11.4 },
          topRight: { x: 110.2, y: 11.4 },
          bottomLeft: { x: 10.2, y: 111.4 },
          bottomRight: { x: 110.2, y: 111.4 }
        }
      },
      { text: 'first', format: 'QRCode', position: {} }
    ])
    const reader = createQrReader({ base64Wasm: 'AAEC', prepareZXingModule, readBarcodes: readBarcodesMock })

    await reader(new Uint8Array([1]), { maxNumberOfSymbols: 1 })

    expect(prepareZXingModule).toHaveBeenCalledWith({ overrides: { wasmBinary: expect.any(ArrayBuffer) }, fireImmediately: true })
    expect(readBarcodesMock).toHaveBeenCalledWith(expect.any(Uint8Array), expect.objectContaining({
      formats: ['QRCode'],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      maxNumberOfSymbols: 1,
      returnErrors: false
    }))
    expect(normalizeQrResults([{ text: 'first', format: 'QRCode', position: {} }, { text: 'first', format: 'QRCode', position: {} }])).toHaveLength(1)
  })

  it('caps normalized symbols', () => {
    const repeated = Array.from({ length: 5 }, (_, index) => ({ text: `value-${index}` }))
    expect(normalizeQrResults(repeated, 3)).toHaveLength(3)
    expect(normalizeQrResults([{ text: '' }, { text: 'value' }])).toHaveLength(1)
  })
})

describe('offline QR generation and recognition round trip', () => {
  it('reads a locally generated QR code using the inline reader WASM', async () => {
    const wasmPath = resolve(process.cwd(), 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')
    const wasmBytes = new Uint8Array(readFileSync(wasmPath))
    const reader = createQrReader({
      base64Wasm: toBase64(wasmBytes),
      prepareZXingModule,
      readBarcodes
    })
    const pngBytes = await createQrPngBytes('https://www.toolhelper.cn/?offline=1')
    const results = await reader(pngBytes)

    expect(results).toHaveLength(1)
    expect(results[0].text).toBe('https://www.toolhelper.cn/?offline=1')
    expect(results[0].format).toBe('QRCode')
    expect(results[0].hasPosition).toBe(true)
  }, 20000)
})

describe('QR result exporters', () => {
  it('creates deterministic text, CSV and JSON output', () => {
    const results = [{
      text: 'hello, "world"',
      format: 'QRCode',
      position: {
        topLeft: { x: 10, y: 20 },
        topRight: { x: 110, y: 20 },
        bottomLeft: { x: 10, y: 120 },
        bottomRight: { x: 110, y: 120 }
      },
      hasPosition: true
    }]

    expect(qrResultsToText(results)).toBe('hello, "world"')
    expect(qrResultsToCsv(results)).toContain('"hello, ""world"""')
    const parsed = JSON.parse(qrResultsToJson(results))
    expect(parsed.count).toBe(1)
    expect(parsed.results[0].text).toBe('hello, "world"')
    expect(positionKey(results[0].position)).toBe('10,20|110,20|10,120|110,120')
  })

  it('exposes offline-safe limits', () => {
    expect(QR_FILE_LIMITS.maxFileBytes).toBe(16 * 1024 * 1024)
    expect(QR_FILE_LIMITS.maxFiles).toBe(20)
    expect(QR_FILE_LIMITS.allowedTypes.has('image/png')).toBe(true)
    expect(QR_FILE_LIMITS.allowedTypes.has('image/gif')).toBe(false)
  })
})
