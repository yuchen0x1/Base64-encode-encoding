<template>
  <div class="tool-content">
    <div class="tool-toolbar">
      <div class="mode-switch">
        <button type="button" class="btn btn-sm" :class="mode === 'generate' ? 'btn-primary' : 'btn-secondary'" @click="mode = 'generate'">生成二维码</button>
        <button type="button" class="btn btn-sm" :class="mode === 'decode' ? 'btn-primary' : 'btn-secondary'" @click="mode = 'decode'">识别二维码</button>
      </div>
      <div v-if="mode === 'generate'" class="options">
        <label class="param-item"><span>尺寸:</span>
          <select v-model="size" class="select-control">
            <option :value="180">180px</option><option :value="256">256px</option><option :value="360">360px</option>
          </select>
        </label>
        <label class="param-item"><span>容错率:</span>
          <select v-model="errorCorrectionLevel" class="select-control">
            <option value="L">L (7%)</option><option value="M">M (15%)</option><option value="Q">Q (25%)</option><option value="H">H (30%)</option>
          </select>
        </label>
        <button class="btn btn-primary btn-sm" :disabled="!qrDataUrl" @click="downloadQr">保存 PNG</button>
      </div>
      <div v-else class="options">
        <button class="btn btn-primary btn-sm" @click="selectFiles">选择图片</button>
        <button class="btn btn-secondary btn-sm" :disabled="!scanFiles.length && !scanResults.length" @click="clearScan">清空</button>
      </div>
    </div>
    <div v-if="mode === 'generate'" class="workbench-grid">
      <div class="panel">
        <div class="panel-header"><span class="panel-title">二维码内容</span><span class="stat-badge">{{ qrInput.length }} 字符</span></div>
        <textarea v-model="qrInput" class="textarea-control" placeholder="请输入需要生成二维码的网址或文本内容..."></textarea>
      </div>
      <div class="panel qr-preview-panel">
        <div class="panel-header"><span class="panel-title">实时预览</span></div>
        <div class="qr-canvas-wrapper">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="二维码" class="qr-image" />
          <div v-else-if="isGenerating" role="status" class="placeholder-tip">正在生成二维码…</div>
          <div v-else-if="generateError" role="alert" class="tool-error">{{ generateError }}</div>
          <div v-else class="placeholder-tip">输入内容后即可生成二维码</div>
        </div>
      </div>
    </div>
    <div v-else class="workbench-grid">
      <div class="panel">
        <div class="panel-header"><span class="panel-title">图片输入</span><span class="stat-badge">{{ scanFiles.length }}/{{ QR_FILE_LIMITS.maxFiles }}</span></div>
        <div class="decode-body">
          <div class="drop-zone" :class="{ dragging: isDragging }" role="button" tabindex="0" @click="selectFiles" @keydown.enter.prevent="selectFiles" @keydown.space.prevent="selectFiles" @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false" @drop.prevent="handleDrop">
            <strong>点击选择或拖入图片</strong>
            <p>支持 PNG / JPEG / WebP，单张最大 16MB，最多 {{ QR_FILE_LIMITS.maxFiles }} 张。</p>
            <p class="muted">完全离线识别，图片不会上传。</p>
          </div>
          <div v-if="scanError" role="alert" class="tool-error">{{ scanError }}</div>
          <div v-if="scanStatus" class="scan-status" :class="{ active: isScanning }">{{ scanStatus }}</div>
          <ul class="file-list"><li v-for="item in scanFiles" :key="item.id"><span class="file-name" :title="item.name">{{ item.name }}</span><span class="file-status" :class="item.status">{{ item.statusText }}</span></li></ul>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><span class="panel-title">识别结果</span><span class="stat-badge">{{ scanResults.length }} 条</span></div>
        <div class="decode-body">
          <div v-if="scanResults.length" class="result-actions">
            <button class="btn btn-secondary btn-sm" @click="copyResults">复制文本</button>
            <button class="btn btn-secondary btn-sm" @click="downloadResults('csv')">导出 CSV</button>
            <button class="btn btn-secondary btn-sm" @click="downloadResults('json')">导出 JSON</button>
          </div>
          <div v-if="!scanResults.length && !isScanning" class="placeholder-tip">选择图片后将使用本地 WASM 引擎识别二维码。</div>
          <div v-for="(result, index) in scanResults" :key="`${result.sourceName}-${index}`" class="result-item">
            <div class="result-header"><span class="result-index">#{{ index + 1 }}</span><span class="result-source" :title="result.sourceName">{{ result.sourceName }}</span><button class="btn btn-secondary btn-sm" @click="copyResult(result.text)">复制</button></div>
            <pre class="result-text code-font">{{ result.text }}</pre>
            <div class="result-meta">{{ result.format }} · {{ result.sizeLabel }}</div>
          </div>
        </div>
      </div>
    </div>
    <input ref="fileInput" type="file" class="hidden-input" accept="image/png,image/jpeg,image/jpg,image/webp" multiple @change="handleFileChange" />
  </div>
</template>
<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import base64Wasm from 'virtual:zxing-wasm-reader-base64'
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import { createQrDataUrl } from '../../utils/toolHelpers.js'
import { QR_FILE_LIMITS, createQrReader, qrResultsToCsv, qrResultsToJson, qrResultsToText } from '../../utils/qrDecoder.js'
import { copyText } from '../../utils/clipboard.js'
import { globalToast } from '../../composables/useToast.js'

const mode = ref('generate')
const qrInput = ref('https://www.toolhelper.cn/')
const size = ref(256)
const errorCorrectionLevel = ref('M')
const qrDataUrl = ref('')
const isGenerating = ref(false)
const generateError = ref('')
const fileInput = ref(null)
const scanFiles = ref([])
const scanResults = ref([])
const scanError = ref('')
const scanStatus = ref('')
const isScanning = ref(false)
const isDragging = ref(false)
let generation = 0
let scanToken = 0
let qrReader = null
const allowedTypes = computed(() => QR_FILE_LIMITS.allowedTypes)

async function generateQr() {
  const currentGeneration = ++generation
  isGenerating.value = Boolean(qrInput.value.trim())
  generateError.value = ''
  const dataUrl = await createQrDataUrl(qrInput.value, { width: size.value, margin: 2, errorCorrectionLevel: errorCorrectionLevel.value, color: { dark: '#000000', light: '#ffffff' } }, (text, options) => QRCode.toDataURL(text, options), () => {
    if (currentGeneration === generation) generateError.value = '无法生成二维码：内容过长，请缩短内容或降低容错率。'
  })
  if (currentGeneration !== generation) return
  qrDataUrl.value = dataUrl
  isGenerating.value = false
}
function downloadQr() { if (qrDataUrl.value) downloadBlob(qrDataUrl.value, `qrcode_${Date.now()}.png`) }
function selectFiles() { fileInput.value?.click() }
function acceptedFileType(file) { return allowedTypes.value.has(String(file?.type || '').toLowerCase()) }
function validateAndMapFiles(files) {
  const list = Array.from(files || [])
  if (list.length > QR_FILE_LIMITS.maxFiles) return { files: [], error: `一次最多识别 ${QR_FILE_LIMITS.maxFiles} 张图片` }
  const accepted = []
  const rejected = []
  for (const file of list) {
    if (!acceptedFileType(file)) { rejected.push(`${file.name || '未命名图片'}：不支持的图片格式`); continue }
    if (file.size > QR_FILE_LIMITS.maxFileBytes) { rejected.push(`${file.name || '未命名图片'}：超过 16MB`); continue }
    accepted.push({ file, id: `${file.name || 'image'}-${file.size}-${file.lastModified || 0}-${accepted.length}`, name: file.name || '剪贴板图片', status: 'pending', statusText: '等待识别' })
  }
  return { files: accepted, error: rejected.join('；') }
}
async function decodeFiles(files) {
  const { files: mapped, error } = validateAndMapFiles(files)
  scanError.value = error
  if (!mapped.length) { scanFiles.value = []; scanResults.value = []; scanStatus.value = ''; isScanning.value = false; return }
  const currentToken = ++scanToken
  scanFiles.value = mapped
  scanResults.value = []
  isScanning.value = true
  scanStatus.value = '正在初始化本地二维码引擎…'
  try {
    if (!qrReader) qrReader = createQrReader({ base64Wasm, prepareZXingModule, readBarcodes })
    for (const item of mapped) {
      if (currentToken !== scanToken) return
      item.status = 'scanning'
      item.statusText = '识别中'
      scanStatus.value = `正在识别 ${item.name}…`
      try {
        const results = await qrReader(item.file)
        if (currentToken !== scanToken) return
        if (!results.length) { item.status = 'not-found'; item.statusText = '未识别到二维码'; continue }
        item.status = 'success'
        item.statusText = `识别到 ${results.length} 条`
        for (const result of results) scanResults.value.push(appendSource(result, item.name))
      } catch (decodeError) {
        if (currentToken !== scanToken) return
        item.status = 'error'
        item.statusText = '识别失败'
        scanError.value = decodeError.message || '二维码识别失败'
      }
    }
    if (currentToken === scanToken) scanStatus.value = scanResults.value.length ? `识别完成，共 ${scanResults.value.length} 条结果` : '识别完成，未发现二维码'
  } catch (setupError) {
    if (currentToken === scanToken) { scanError.value = setupError.message || '二维码识别模块初始化失败'; scanStatus.value = '' }
  } finally {
    if (currentToken === scanToken) isScanning.value = false
  }
}
function appendSource(result, sourceName) {
  const points = [result.position?.topLeft, result.position?.topRight, result.position?.bottomLeft, result.position?.bottomRight].filter(Boolean)
  return { ...result, sourceName, sizeLabel: points.length === 4 ? `${Math.round(points[1].x - points[0].x)}×${Math.round(points[2].y - points[0].y)} px` : '位置未知' }
}
function handleFileChange(event) {
  const files = event.target.files
  if (files?.length) decodeFiles(files)
  event.target.value = ''
}
function handleDrop(event) {
  isDragging.value = false
  const files = event.dataTransfer?.files
  if (files?.length) decodeFiles(files)
}
function clearScan() {
  scanToken += 1
  scanFiles.value = []
  scanResults.value = []
  scanError.value = ''
  scanStatus.value = ''
  isScanning.value = false
  isDragging.value = false
}
async function copyResults() {
  const text = qrResultsToText(scanResults.value)
  if (await copyText(text)) globalToast(`已复制 ${scanResults.value.length} 条二维码结果`)
}
async function copyResult(text) { if (await copyText(text)) globalToast('已复制二维码内容') }
function downloadResults(kind) {
  const text = kind === 'csv' ? qrResultsToCsv(scanResults.value) : qrResultsToJson(scanResults.value)
  const mime = kind === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8'
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  downloadBlob(url, `qrcode-results_${Date.now()}.${kind}`)
  URL.revokeObjectURL(url)
}
function downloadBlob(href, filename) {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
}
watch([qrInput, size, errorCorrectionLevel], generateQr, { immediate: true })
onUnmounted(() => { generation += 1; scanToken += 1 })
</script>
<style scoped>
.tool-content { display: flex; flex-direction: column; gap: 1rem; }
.tool-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; padding: .75rem 1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: .5rem; }
.mode-switch { display: flex; gap: .5rem; }
.options { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
.param-item { display: flex; align-items: center; gap: .4rem; font-size: .85rem; }
.select-control { background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-main); padding: .35rem .6rem; border-radius: .375rem; font-size: .8rem; outline: none; }
.workbench-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.panel { display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: .5rem; overflow: hidden; }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: .625rem 1rem; background: var(--bg-input); border-bottom: 1px solid var(--border-color); }
.panel-title { font-size: .85rem; font-weight: 600; }
.stat-badge { font-size: .75rem; color: var(--text-muted); }
.textarea-control { flex: 1; border: none; border-radius: 0; padding: 1rem; min-height: 280px; resize: vertical; }
.qr-preview-panel { align-items: stretch; }
.qr-canvas-wrapper { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.qr-image { max-width: 100%; border-radius: .5rem; box-shadow: var(--shadow-md); background: #fff; padding: .5rem; }
.decode-body { padding: 1rem; display: flex; flex-direction: column; gap: .75rem; min-height: 280px; }
.drop-zone { border: 1.5px dashed var(--border-color); border-radius: .5rem; padding: 1.5rem; text-align: center; cursor: pointer; transition: border-color .15s, background .15s; }
.drop-zone.dragging { border-color: var(--accent-cyan); background: rgba(var(--rgb-primary), .08); }
.drop-zone p { margin: .35rem 0 0; font-size: .82rem; color: var(--text-muted); }
.muted { font-size: .75rem !important; }
.tool-error { color: var(--accent-red); font-size: .82rem; line-height: 1.5; }
.scan-status { font-size: .82rem; color: var(--text-muted); }
.scan-status.active { color: var(--accent-cyan); }
.file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: .4rem; max-height: 180px; overflow: auto; }
.file-list li { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .5rem .65rem; border: 1px solid var(--border-color); border-radius: .4rem; font-size: .8rem; }
.file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-status.pending { color: var(--text-muted); }
.file-status.scanning { color: var(--accent-cyan); }
.file-status.success { color: var(--accent-green, #22c55e); }
.file-status.not-found, .file-status.error { color: var(--accent-red); }
.result-actions { display: flex; gap: .5rem; flex-wrap: wrap; }
.result-item { padding: .75rem; border: 1px solid var(--border-color); border-radius: .5rem; }
.result-header { display: flex; align-items: center; gap: .5rem; }
.result-index { font-weight: 700; font-size: .8rem; color: var(--accent-cyan); }
.result-source { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .78rem; color: var(--text-muted); }
.result-text { margin: .55rem 0 .35rem; padding: .6rem; min-height: 2.4em; max-height: 180px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: var(--bg-input); border-radius: .4rem; }
.result-meta { font-size: .75rem; color: var(--text-muted); }
.placeholder-tip { color: var(--text-muted); font-size: .85rem; }
.hidden-input { display: none; }
@media (max-width: 768px) { .workbench-grid { grid-template-columns: 1fr; } }
</style>
