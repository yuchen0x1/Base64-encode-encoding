import base64Wasm from 'virtual:zxing-wasm-reader-base64'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { createQrReader } from '../utils/qrDecoder.js'

let reader

self.onmessage = async event => {
  const { id, type, payload } = event.data || {}
  if (type !== 'decode') return

  try {
    reader ||= createQrReader({ base64Wasm, prepareZXingModule, readBarcodes })
    const results = await reader(new Uint8Array(payload))
    self.postMessage({ id, result: results })
  } catch (error) {
    self.postMessage({
      id,
      error: error?.message || '二维码识别失败',
      kind: error?.kind || (reader ? 'decode' : 'setup')
    })
  }
}
