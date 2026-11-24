export const QR_FILE_LIMITS = Object.freeze({
  maxFileBytes: 16 * 1024 * 1024,
  maxFiles: 20,
  maxSymbolsPerImage: 20,
  allowedTypes: new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])
})

export function decodeBase64ToUint8Array(base64) {
  let clean = String(base64 ?? '').replace(/\s+/g, '')
  if (!clean || clean.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new Error('WASM 数据无效')
  }
  const padding = clean.indexOf('=')
  if (padding >= 0 && clean.length % 4 !== 0) throw new Error('WASM 数据无效')
  if (padding < 0) clean += '='.repeat((4 - clean.length % 4) % 4)
  const padded = clean
  const binary = globalThis.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function createQrReader({
  base64Wasm,
  prepareZXingModule,
  readBarcodes
}) {
  if (!base64Wasm || !prepareZXingModule || !readBarcodes) {
    throw new Error('二维码识别模块未初始化')
  }
  const wasmBytes = decodeBase64ToUint8Array(base64Wasm)
  prepareZXingModule({
    overrides: { wasmBinary: wasmBytes.buffer },
    fireImmediately: true
  })
  return async function decodeQrImage(input, options = {}) {
    const callOptions = { ...options }
    callOptions.maxNumberOfSymbols = Number.isFinite(callOptions.maxNumberOfSymbols)
      ? Math.min(QR_FILE_LIMITS.maxSymbolsPerImage, Math.max(1, Math.floor(callOptions.maxNumberOfSymbols)))
      : QR_FILE_LIMITS.maxSymbolsPerImage
    const results = await readBarcodes(input, {
      formats: ['QRCode'],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      tryDownscale: true,
      returnErrors: false,
      ...callOptions
    })
    return normalizeQrResults(results)
  }
}

/** Remove duplicate symbols by text and nearby position within one image. */
export function normalizeQrResults(results, maxSymbols = QR_FILE_LIMITS.maxSymbolsPerImage) {
  const seen = new Set()
  const output = []

  for (const result of Array.isArray(results) ? results : []) {
    const position = result?.position || {}
    const text = String(result?.text ?? '')
    if (!text) continue
    const points = [
      position.topLeft,
      position.topRight,
      position.bottomLeft,
      position.bottomRight
    ].filter(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))

    const key = [
      text,
      points.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|')
    ].join('#')
    if (seen.has(key)) continue
    seen.add(key)

    output.push({
      text,
      format: String(result?.format || result?.symbology || 'QRCode'),
      position,
      hasPosition: points.length === 4
    })
    if (output.length >= maxSymbols) break
  }

  return output
}

export function qrResultsToText(results) {
  return (Array.isArray(results) ? results : [])
    .map(result => result.text)
    .filter(text => text.length > 0)
    .join('\n')
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function qrResultsToCsv(results) {
  const rows = Array.isArray(results) ? results : []
  const header = ['编号', '内容', '格式', '位置', '尺寸(px)']
  const body = rows.map((result, index) => {
    const points = [result.position?.topLeft, result.position?.topRight, result.position?.bottomLeft, result.position?.bottomRight]
    const position = points
      .filter(Boolean)
      .map(point => `(${Math.round(point.x)},${Math.round(point.y)})`)
      .join(' ')
    const width = points.length === 4 ? Math.round(points[1].x - points[0].x) : ''
    return [index + 1, result.text, result.format, position, width]
  })
  return '\uFEFF' + [header, ...body].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function qrResultsToJson(results) {
  const rows = Array.isArray(results) ? results : []
  return JSON.stringify({
    source: 'geek-toolbox-qr-reader',
    generatedAt: new Date().toISOString(),
    count: rows.length,
    results: rows.map(result => ({
      text: result.text,
      format: result.format,
      position: result.hasPosition ? result.position : null
    }))
  }, null, 2)
}

/** Deterministic, offline fixture helpers for tests and UI previews. */
export function positionKey(position) {
  const points = [position?.topLeft, position?.topRight, position?.bottomLeft, position?.bottomRight]
  return points.map(point => [Math.round(point?.x ?? 0), Math.round(point?.y ?? 0)].join(',')).join('|')
}
