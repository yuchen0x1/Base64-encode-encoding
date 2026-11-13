<template>
  <div class="tool-content">
    <!-- 顶部控制台 -->
    <div class="glass-panel tool-toolbar">
      <div class="mode-toggles">
        <button :disabled="processing" :class="['tab-pill', sourceMode === 'text' ? 'active' : '']" @click="switchMode('text')">
          <span class="pill-dot"></span>
          <span>文本批量</span>
        </button>
        <button :disabled="processing" :class="['tab-pill', sourceMode === 'file' ? 'active' : '']" @click="switchMode('file')">
          <span class="pill-dot"></span>
          <span>文件批量</span>
        </button>
      </div>

      <div class="actions">
        <label v-if="steps.includes('base64-encode')" class="cyber-checkbox">
          <input v-model="options.urlSafeBase64" :disabled="processing" type="checkbox" />
          <span class="check-box-custom"></span>
          <span>URL-Safe</span>
        </label>
        <label v-if="isHashOp" class="cyber-checkbox">
          <input v-model="options.upperHash" :disabled="processing" type="checkbox" />
          <span class="check-box-custom"></span>
          <span>大写输出</span>
        </label>
        <label v-if="sourceMode === 'text'" class="cyber-checkbox">
          <input v-model="options.skipEmpty" :disabled="processing" type="checkbox" />
          <span class="check-box-custom"></span>
          <span>跳过空行</span>
        </label>
        <button class="btn btn-primary btn-sm" :disabled="processing" @click="start">
          <Play v-if="!processing" :size="14" />
          <Loader2 v-else :size="14" class="spin" />
          <span>{{ processing ? '处理中…' : '开始处理' }}</span>
        </button>
        <button v-if="processing" class="btn btn-secondary btn-sm" @click="cancel">
          <Square :size="13" />
          <span>停止</span>
        </button>
        <button class="btn btn-secondary btn-sm" :disabled="processing" @click="clearAll">
          <Trash2 :size="14" />
          <span>清空</span>
        </button>
      </div>
    </div>

    <fieldset class="glass-panel recipe-panel" :disabled="processing">
      <legend>处理流程</legend>
      <div class="recipe-header">
        <p>每条数据依次执行以下步骤，最多 {{ BATCH_LIMITS.steps }} 步。</p>
        <div class="recipe-actions">
          <select aria-label="选择常用配方" class="input-control" @change="applyPreset">
            <option value="">常用配方…</option>
            <option value="decode-json">Base64 解码 → JSON 格式化</option>
            <option value="json-url">JSON 压缩 → URL 编码</option>
            <option value="binary-hash">Base64 解码 → SHA-256</option>
          </select>
          <button class="btn btn-secondary btn-sm" @click="exportRecipe">导出配方</button>
          <button class="btn btn-secondary btn-sm" @click="recipeInput?.click()">导入配方</button>
          <input ref="recipeInput" class="hidden-input" type="file" accept="application/json,.json" aria-label="选择处理配方文件" @change="importRecipe" />
        </div>
      </div>
      <ol class="recipe-steps">
        <li v-for="(step, index) in steps" :key="index" class="recipe-step">
          <span class="step-number">{{ index + 1 }}</span>
          <select v-model="steps[index]" class="input-control" :aria-label="`第 ${index + 1} 步处理方式`">
            <optgroup v-for="group in operations" :key="group.group" :label="group.group">
              <option v-for="op in group.items" :key="op.value" :value="op.value">{{ op.label }}</option>
            </optgroup>
          </select>
          <button class="btn btn-secondary btn-sm" :disabled="index === 0" :aria-label="`上移第 ${index + 1} 步`" @click="moveStep(index, -1)">↑</button>
          <button class="btn btn-secondary btn-sm" :disabled="index === steps.length - 1" :aria-label="`下移第 ${index + 1} 步`" @click="moveStep(index, 1)">↓</button>
          <button class="btn btn-secondary btn-sm" :disabled="steps.length === 1" :aria-label="`删除第 ${index + 1} 步`" @click="steps.splice(index, 1)">删除</button>
        </li>
      </ol>
      <div class="recipe-footer">
        <button class="btn btn-secondary btn-sm" :disabled="steps.length >= BATCH_LIMITS.steps" @click="steps.push('sha256')">＋ 添加步骤</button>
        <span>配方只包含步骤与选项，不包含输入或结果。</span>
      </div>
    </fieldset>
    <p v-if="runError" class="run-message is-error" role="alert">{{ runError }}</p>
    <p v-if="runSnapshot" class="run-message" role="status" aria-live="polite">
      {{ runStatusLabel }} · {{ processedCount }} / {{ totalCount }} 条 · {{ runSnapshot.recipe.steps.map(batchOperationLabel).join(' → ') }}
      <span v-if="recipeChanged">（流程已修改；下方仍为上次运行结果）</span>
    </p>

    <div class="batch-grid">
      <!-- 输入区 -->
      <section class="glass-panel panel">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="hud-marker">IN</span>
            <span class="panel-title">{{ sourceMode === 'text' ? '待处理文本（每行一条）' : '待处理文件列表' }}</span>
          </div>
          <span class="stat-badge code-font">
            {{ sourceMode === 'text' ? `${lineCount} 行 · ${formatSize(textBytes)}` : `${files.length} 个文件 · ${formatSize(totalFileSize)}` }}
          </span>
        </div>

        <template v-if="sourceMode === 'text'">
          <textarea
            v-model="textInput"
            :disabled="processing"
            aria-label="待处理文本，每行一条"
            class="textarea-control code-font batch-textarea"
            spellcheck="false"
            placeholder="每行一条待处理内容，例如：&#10;hello world&#10;极客工具箱&#10;https://toolhelper.cn/?q=测试"
          ></textarea>
          <div class="panel-foot">
            <button class="btn btn-secondary btn-sm" :disabled="processing" @click="loadSample">载入示例</button>
            <button class="btn btn-secondary btn-sm" :disabled="processing" @click="pasteFromClipboard">读取剪贴板</button>
            <span class="foot-tip">最多 {{ MAX_LINES }} 行，单条上限 2 MB</span>
          </div>
        </template>

        <template v-else>
          <div
            :class="['drop-zone', dragging ? 'dragging' : '']"
            role="button" tabindex="0" aria-label="添加待处理文件" :aria-disabled="processing"
            @click="pickFiles"
            @keydown.enter.prevent="pickFiles"
            @keydown.space.prevent="pickFiles"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <input ref="fileInput" type="file" multiple :disabled="processing" class="hidden-input" @change="onPickFiles" />
            <UploadCloud :size="28" />
            <p class="drop-title">拖拽文件到此处，或点击选择</p>
            <p class="drop-sub">支持多选；哈希 / Base64 单文件上限 {{ formatSize(MAX_FILE_BYTES) }}</p>
          </div>

          <div class="file-list">
            <div v-for="(item, index) in files" :key="item.id" class="file-row">
              <FileIcon :size="14" class="file-icon" />
              <span class="file-name" :title="item.name">{{ item.name }}</span>
              <span class="file-size code-font">{{ formatSize(item.size) }}</span>
              <button class="file-remove" :disabled="processing" :aria-label="`移除 ${item.name}`" title="移除" @click.stop="removeFile(index)">
                <X :size="13" />
              </button>
            </div>
            <div v-if="!files.length" class="empty-state small">尚未添加文件</div>
          </div>

          <div class="panel-foot">
            <button class="btn btn-secondary btn-sm" :disabled="processing" @click="pickFiles">选择文件</button>
            <button class="btn btn-secondary btn-sm" :disabled="processing || !files.length" @click="files = []">清空列表</button>
            <span class="foot-tip">按文件字节处理，不做任何上传</span>
          </div>
        </template>
      </section>

      <!-- 结果区 -->
      <section class="glass-panel panel">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="hud-marker out">OUT</span>
            <span class="panel-title">处理结果矩阵</span>
          </div>
          <div class="panel-actions">
            <span class="stat-badge code-font">{{ okCount }} 成功 / {{ errorCount }} 失败</span>
            <button class="btn btn-secondary btn-sm" :disabled="processing || !okCount" @click="copyAll">
              <Copy :size="13" />
              <span>复制全部</span>
            </button>
          </div>
        </div>

        <div class="result-toolbar">
          <div class="filter-tabs">
            <button
              v-for="tab in filterTabs"
              :key="tab.value"
              :class="['filter-pill', filter === tab.value ? 'active' : '']"
              @click="filter = tab.value"
            >
              {{ tab.label }}
              <span class="pill-count">{{ tab.count }}</span>
            </button>
          </div>
          <input v-model="search" aria-label="筛选处理结果" class="input-control search-input-mini" placeholder="筛选结果…" />
          <div class="export-group">
            <button class="export-btn" :disabled="processing || !results.length" title="导出 TXT" @click="exportAs('txt')">TXT</button>
            <button class="export-btn" :disabled="processing || !results.length" title="导出 CSV" @click="exportAs('csv')">CSV</button>
            <button class="export-btn" :disabled="processing || !results.length" title="导出 JSON" @click="exportAs('json')">JSON</button>
          </div>
        </div>

        <div v-if="runSnapshot" class="progress-strip">
          <div class="bar-track" role="progressbar" aria-label="批量处理进度" :aria-valuenow="processedCount" :aria-valuemax="totalCount" aria-valuemin="0">
            <span class="bar-fill" :style="{ width: `${progress}%` }"></span>
          </div>
          <span class="progress-text code-font">{{ processedCount }} / {{ totalCount }}</span>
        </div>

        <div class="result-list">
          <div v-for="row in pagedResults" :key="row.id" class="result-item">
            <div :class="['result-row', row.ok ? '' : 'is-error', expandedId === row.id ? 'expanded' : '']" tabindex="0" :aria-expanded="expandedId === row.id" @click="toggleRow(row)" @keydown.enter.prevent="toggleRow(row)" @keydown.space.prevent="toggleRow(row)">
              <span class="row-index code-font">{{ row.index }}</span>
              <div class="row-source" :title="row.source">{{ row.label }}</div>
              <div class="row-output code-font">{{ row.ok ? preview(row.output) : row.error }}</div>
              <span class="row-meta code-font">{{ row.ok ? row.sizeText : '失败' }}</span>
              <button v-if="row.ok" class="row-copy" title="复制该行结果" @click.stop="copyRow(row)">
                <Copy :size="12" />
              </button>
              <span v-else class="row-copy disabled"><AlertTriangle :size="12" /></span>
            </div>
            <div v-if="expandedId === row.id" class="row-detail" @click.stop>
              <pre class="detail-pre code-font">{{ row.ok ? detailText(row) : row.error }}</pre>
              <div class="detail-foot">
                <span class="detail-meta">{{ row.ok ? `${row.output.length} 字符` : '该行处理失败' }}</span>
                <button v-if="row.ok" class="btn btn-primary btn-sm" @click="copyRow(row)">复制完整结果</button>
              </div>
            </div>
          </div>

          <div v-if="!results.length" class="empty-state">
            <ListChecks :size="26" />
            <p>添加数据后点击「开始处理」</p>
            <p class="hint">结果全部在本地内存中计算，不会上传到任何服务器</p>
          </div>
          <div v-else-if="!visibleResults.length" class="empty-state small">没有符合筛选条件的结果</div>
        </div>
        <div v-if="visibleResults.length > PAGE_SIZE" class="result-pagination">
          <button class="btn btn-secondary btn-sm" :disabled="page === 1" @click="page--">上一页</button>
          <span>{{ page }} / {{ pageCount }} 页 · {{ visibleResults.length }} 条</span>
          <button class="btn btn-secondary btn-sm" :disabled="page === pageCount" @click="page++">下一页</button>
        </div>
      </section>
    </div>

    <div class="glass-panel tool-tips">
      <div class="tip-content">
        <span class="tip-badge">BATCH ENGINE</span>
        <span>后台按顺序处理，可随时停止；每批最多 1000 条、输入合计 128 MB。二进制可直接编码或计算哈希；文本操作要求有效 UTF-8。CSV 对公式前缀添加单引号，原始内容请导出 JSON / TXT。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onUnmounted } from 'vue'
import { globalToast } from '../../composables/useToast.js'
import { getUniqueFileReferences, splitBatchLines } from '../../utils/toolHelpers.js'
import {
  BATCH_LIMITS, BATCH_OPERATIONS as operations, batchOperationLabel,
  createBatchRecipe, parseBatchRecipe, batchResultsCsv, createBatchExport
} from '../../utils/batchProcessing.js'
import { createBatchRunner } from '../../utils/batchRunner.js'
import { Play, Square, Trash2, Copy, ListChecks, UploadCloud, FileText as FileIcon, X, AlertTriangle, Loader2 } from 'lucide-vue-next'

const MAX_LINES = BATCH_LIMITS.rows
const MAX_FILE_BYTES = BATCH_LIMITS.fileBytes
const DETAIL_LIMIT = 200000
const PAGE_SIZE = 100
const sourceMode = ref('text')
const textInput = ref('')
const files = ref([])
const steps = ref(['base64-encode'])
const recipeInput = ref(null)
const filter = ref('all')
const search = ref('')
const page = ref(1)
const expandedId = ref(null)
const processing = ref(false)
const progress = ref(0)
const processedCount = ref(0)
const totalCount = ref(0)
const dragging = ref(false)
const fileInput = ref(null)
const results = ref([])
const runSnapshot = ref(null)
const runStatus = ref('idle')
const runError = ref('')
const options = reactive({ urlSafeBase64: false, upperHash: false, skipEmpty: true })
let cancelRequested = false
let runner = null
let activeReader = null
let seed = 0
const nextId = () => ++seed
const isHashOp = computed(() => steps.value.some(op => ['md5', 'sha1', 'sha256'].includes(op)))
const lines = computed(() => {
  const raw = splitBatchLines(textInput.value)
  return options.skipEmpty ? raw.filter(line => line.trim() !== '') : raw
})
const lineCount = computed(() => lines.value.length)
const textBytes = computed(() => new TextEncoder().encode(textInput.value).length)
const totalFileSize = computed(() => files.value.reduce((sum, item) => sum + item.size, 0))
const okCount = computed(() => results.value.filter(row => row.ok).length)
const errorCount = computed(() => results.value.length - okCount.value)
const filterTabs = computed(() => [
  { value: 'all', label: '全部', count: results.value.length },
  { value: 'ok', label: '成功', count: okCount.value },
  { value: 'error', label: '失败', count: errorCount.value }
])
const visibleResults = computed(() => {
  let list = results.value
  if (filter.value === 'ok') list = list.filter(row => row.ok)
  if (filter.value === 'error') list = list.filter(row => !row.ok)
  const keyword = search.value.trim().toLowerCase()
  if (keyword) list = list.filter(row => [row.source, row.output, row.error].some(value => (value || '').toLowerCase().includes(keyword)))
  return list
})
const pageCount = computed(() => Math.max(1, Math.ceil(visibleResults.value.length / PAGE_SIZE)))
const pagedResults = computed(() => visibleResults.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
watch([filter, search], () => { page.value = 1; expandedId.value = null })
watch(pageCount, count => { page.value = Math.min(page.value, count) })
const recipeChanged = computed(() => runSnapshot.value && JSON.stringify(createBatchRecipe(steps.value, options)) !== JSON.stringify(runSnapshot.value.recipe))
const runStatusLabel = computed(() => ({
  running: '处理中', stopped: '已停止，保留已完成结果', failed: '处理中断',
  complete: errorCount.value ? '处理完成，部分条目失败' : '处理完成'
})[runStatus.value] || '')

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
function preview(text) {
  const flat = String(text).slice(0, 1024).replace(/\s+/g, ' ')
  return flat.length > 88 ? `${flat.slice(0, 88)}…` : flat
}
function detailText(row) {
  return row.output.length <= DETAIL_LIMIT ? row.output : `${row.output.slice(0, DETAIL_LIMIT)}\n\n… 已截断显示，完整内容共 ${row.output.length} 字符，可通过「复制完整结果」获取`
}
function moveStep(index, direction) {
  if (processing.value) return
  const target = index + direction
  if (target < 0 || target >= steps.value.length) return
  ;[steps.value[index], steps.value[target]] = [steps.value[target], steps.value[index]]
}
function applyPreset(event) {
  if (processing.value) return
  const presets = {
    'decode-json': ['base64-decode', 'json-format'],
    'json-url': ['json-minify', 'url-encode'],
    'binary-hash': ['base64-decode', 'sha256']
  }
  if (presets[event.target.value]) steps.value = [...presets[event.target.value]]
  event.target.value = ''
}
function download(content, mime, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function exportRecipe() {
  download(JSON.stringify(createBatchRecipe(steps.value, options), null, 2), 'application/json;charset=utf-8', 'geek-toolbox-recipe.json')
  globalToast('配方已导出，不含输入或结果')
}
async function importRecipe(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || processing.value) return
  try {
    if (file.size > BATCH_LIMITS.recipeBytes) throw new Error('配方文件不能超过 16 KB')
    const recipe = parseBatchRecipe(await file.text())
    if (processing.value) throw new Error('请在处理结束后导入配方')
    steps.value = recipe.steps
    Object.assign(options, recipe.options)
    globalToast(`已导入 ${recipe.steps.length} 步处理配方`)
  } catch (error) { globalToast(error.message || '配方导入失败', 'error') }
}
function switchMode(mode) {
  if (processing.value) return
  sourceMode.value = mode
  results.value = []
  runSnapshot.value = null
  runError.value = ''
  expandedId.value = null
}
function pickFiles() { if (!processing.value) fileInput.value?.click() }
function addFiles(fileList) {
  if (processing.value) return
  const incoming = getUniqueFileReferences(files.value.map(item => item.file), fileList)
  if (files.value.length + incoming.length > MAX_LINES) {
    globalToast(`单批最多添加 ${MAX_LINES} 个文件`, 'error')
    return
  }
  for (const file of incoming) files.value.push({ id: nextId(), name: file.name, size: file.size, file })
}
function onDrop(event) { dragging.value = false; addFiles(event.dataTransfer?.files) }
function onPickFiles(event) { addFiles(event.target.files); event.target.value = '' }
function removeFile(index) { if (!processing.value) files.value.splice(index, 1) }
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (processing.value) return
    if (text) textInput.value = textInput.value ? `${textInput.value}\n${text}` : text
    else globalToast('剪贴板没有文本内容', 'error')
  } catch { globalToast('无法读取剪贴板，请检查浏览器权限', 'error') }
}
function loadSample() {
  if (steps.value[0] === 'base64-decode') {
    textInput.value = 'eyJuYW1lIjoiR2VlayBUb29sYm94Iiwib2ZmbGluZSI6dHJ1ZX0=\neyJjb3VudCI6M30='
  } else if (steps.value[0].startsWith('json')) {
    textInput.value = '{"name":"极客工具箱","offline":true}\n{"name":"batch","tags":["base64","hash"],"count":3}'
  } else textInput.value = 'hello world\n极客工具箱\nhttps://toolhelper.cn/?q=批量处理'
}
function clearAll() {
  if (processing.value) return
  textInput.value = ''
  files.value = []
  results.value = []
  expandedId.value = null
  runSnapshot.value = null
  runStatus.value = 'idle'
  runError.value = ''
  progress.value = processedCount.value = totalCount.value = 0
  filter.value = 'all'
  search.value = ''
  page.value = 1
}
function toggleRow(row) { expandedId.value = expandedId.value === row.id ? null : row.id }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); globalToast('已复制到剪贴板') }
  catch { globalToast('复制失败：浏览器拒绝访问剪贴板', 'error') }
}
function copyRow(row) { if (row.ok) return copy(row.output) }
function copyAll() { return copy(results.value.filter(row => row.ok).map(row => row.output).join('\n')) }
function exportAs(format) {
  if (processing.value || !results.value.length || !runSnapshot.value) return
  let content
  let mime = 'text/plain;charset=utf-8'
  if (format === 'json') {
    content = JSON.stringify(createBatchExport(results.value, runSnapshot.value, runStatus.value), null, 2)
    mime = 'application/json;charset=utf-8'
  } else if (format === 'csv') {
    content = batchResultsCsv(results.value)
    mime = 'text/csv;charset=utf-8'
  } else content = results.value.map(row => `#${row.index} ${row.label}\n${row.ok ? row.output : `[失败] ${row.error}`}`).join('\n\n')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const operation = runSnapshot.value.recipe.steps.length === 1 ? runSnapshot.value.recipe.steps[0] : 'pipeline'
  download(content, mime, `batch-${operation}-${stamp}.${format}`)
  globalToast(`已导出 ${format.toUpperCase()} 文件（${results.value.length} 条）`)
}
function cancel() {
  cancelRequested = true
  runner?.dispose()
  activeReader?.abort()
}
function readFileAsBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    activeReader = reader
    const timer = setTimeout(() => reader.abort(), 15000)
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.onabort = () => reject(new Error('文件读取已停止或超时'))
    reader.onloadend = () => { clearTimeout(timer); activeReader = null }
    reader.readAsArrayBuffer(file)
  })
}
async function start() {
  if (processing.value) return
  const mode = sourceMode.value
  const list = mode === 'text' ? [...lines.value] : [...files.value]
  runError.value = ''
  if (!list.length) { runError.value = mode === 'text' ? '请先输入待处理文本（每行一条）' : '请先添加待处理文件'; return }
  if (list.length > MAX_LINES) { runError.value = `单次最多 ${MAX_LINES} 条，当前 ${list.length} 条`; return }
  if ((mode === 'text' ? textBytes.value : totalFileSize.value) > BATCH_LIMITS.totalBytes) {
    runError.value = '单批输入合计不能超过 128 MB'; return
  }
  const recipe = createBatchRecipe(steps.value, options)
  runSnapshot.value = { recipe, sourceMode: mode, total: list.length, startedAt: new Date().toISOString() }
  runStatus.value = 'running'
  processing.value = true
  cancelRequested = false
  results.value = []
  expandedId.value = null
  page.value = 1
  filter.value = 'all'
  search.value = ''
  progress.value = processedCount.value = 0
  totalCount.value = list.length
  runner = createBatchRunner()
  let outputBytes = 0
  try {
    for (const [offset, item] of list.entries()) {
      if (cancelRequested) break
      const source = mode === 'text' ? item : item.name
      const row = { id: nextId(), index: offset + 1, source, label: source.length > 60 ? `${source.slice(0, 60)}…` : source, output: '', error: '', ok: false, sizeText: '—', ms: 0 }
      const startedAt = performance.now()
      try {
        const size = mode === 'text' ? new TextEncoder().encode(item).length : item.size
        const max = mode === 'text' ? BATCH_LIMITS.lineBytes : MAX_FILE_BYTES
        if (size > max) throw new Error(`单条 ${formatSize(size)} 超过 ${formatSize(max)} 限制`)
        const bytes = mode === 'text' ? new TextEncoder().encode(item) : await readFileAsBytes(item.file)
        if (cancelRequested) break
        const output = await runner.run(bytes, recipe)
        const byteLength = new TextEncoder().encode(output).length
        if (outputBytes + byteLength > BATCH_LIMITS.totalOutputBytes) {
          runError.value = '结果合计达到 128 MB 上限，已停止；请拆分批次'
          runStatus.value = 'failed'
          break
        }
        outputBytes += byteLength
        Object.assign(row, { output, ok: true, sizeText: formatSize(byteLength), ms: Math.round(performance.now() - startedAt) })
      } catch (error) {
        if (cancelRequested) break
        row.error = error.message || '处理失败'
      }
      results.value.push(row)
      processedCount.value = offset + 1
      progress.value = Math.round(processedCount.value / list.length * 100)
    }
    if (runStatus.value !== 'failed') runStatus.value = cancelRequested ? 'stopped' : 'complete'
  } catch (error) {
    runError.value = error.message || '批量处理失败'
    runStatus.value = 'failed'
  } finally {
    runner?.dispose()
    runner = null
    processing.value = false
  }
}
onUnmounted(cancel)
</script>

<style scoped>
.recipe-panel {
  min-width: 0;
  margin: 0;
  padding: 0.75rem 1rem 1rem;
  border: 1px solid var(--border-color);
}
.recipe-panel legend { padding: 0 0.4rem; font-weight: 700; color: var(--text-main); }
.recipe-header, .recipe-actions, .recipe-footer, .recipe-step, .result-pagination {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.recipe-header { flex-wrap: wrap; justify-content: space-between; }
.recipe-header p, .recipe-footer span { margin: 0; font-size: 0.78rem; color: var(--text-muted); }
.recipe-actions { flex-wrap: wrap; }
.recipe-actions select { width: auto; max-width: 100%; font-size: 0.78rem; }
.recipe-steps { margin: 0.8rem 0; padding: 0; list-style: none; display: grid; gap: 0.5rem; }
.recipe-step select { flex: 1; min-width: 0; font-size: 0.85rem; }
.step-number { flex: 0 0 1.6rem; text-align: center; color: var(--primary-text); font-family: var(--font-mono); }
.recipe-footer { flex-wrap: wrap; }
.run-message { margin: 0; padding: 0.6rem 0.9rem; font-size: 0.8rem; color: var(--text-muted); background: var(--surface-inset); border-radius: 0.4rem; overflow-wrap: anywhere; }
.run-message.is-error { color: var(--accent-red); }
.result-pagination { padding: 0.7rem; justify-content: center; border-top: 1px solid var(--border-color); font-size: 0.8rem; color: var(--text-muted); }
.recipe-panel :focus-visible, .result-row:focus-visible, .drop-zone:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
button:disabled { opacity: 0.45; cursor: default; }
@media (max-width: 600px) {
  .recipe-panel { padding: 0.6rem; }
  .recipe-actions { width: 100%; }
  .recipe-actions select { width: 100%; }
  .recipe-step { gap: 0.3rem; }
  .recipe-step .btn { padding: 0.35rem 0.45rem; }
  .recipe-footer span { flex-basis: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
  .bar-fill { transition: none; }
}
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.tool-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 1.1rem;
}

.mode-toggles {
  display: flex;
  gap: 0.4rem;
}

.tab-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  font-size: 0.775rem;
  font-weight: 700;
  border-radius: 0.4rem;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-sub);
}

.tab-pill.active {
  background: var(--bg-card);
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-primary), 0.35);
  box-shadow: 0 0 12px rgba(var(--rgb-primary), 0.18);
}

.tab-pill.active .pill-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}

.op-picker {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.op-label {
  font-size: 0.72rem;
  color: var(--text-sub);
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.op-select {
  min-width: 170px;
  padding: 0.42rem 0.6rem;
  font-size: 0.78rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.cyber-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.74rem;
  white-space: nowrap;
}

.cyber-checkbox input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-cyan);
  cursor: pointer;
}

.batch-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.85fr) minmax(380px, 1.15fr);
  gap: 1rem;
  flex: 1;
  min-height: 430px;
}

.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.7rem 1rem;
  background: var(--surface-inset);
  border-bottom: 1px solid var(--border-color);
}

.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.hud-marker {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 800;
  padding: 0.1rem 0.32rem;
  border-radius: 3px;
  color: var(--accent-cyan);
  border: 1px solid rgba(var(--rgb-cyan), 0.35);
  background: rgba(var(--rgb-cyan), 0.1);
}

.hud-marker.out {
  color: var(--accent-green);
  border-color: rgba(var(--rgb-green), 0.35);
  background: rgba(var(--rgb-green), 0.1);
}

.panel-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-badge {
  font-size: 0.68rem;
  color: var(--text-sub);
  white-space: nowrap;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.batch-textarea {
  flex: 1;
  min-height: 260px;
  border: none;
  border-radius: 0;
  background: transparent;
  resize: none;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  line-height: 1.6;
}

.panel-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid var(--border-color);
  background: var(--surface-inset);
}

.foot-tip {
  margin-left: auto;
  font-size: 0.66rem;
  color: var(--text-sub);
}

.drop-zone {
  margin: 1rem;
  padding: 1.4rem 1rem;
  border: 1px dashed var(--border-color);
  border-radius: 0.7rem;
  text-align: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--surface-well);
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: rgba(var(--rgb-cyan), 0.55);
  background: rgba(var(--rgb-cyan), 0.07);
  color: var(--accent-cyan);
}

.drop-title {
  margin: 0.5rem 0 0.15rem;
  font-size: 0.82rem;
  font-weight: 700;
}

.drop-sub {
  margin: 0;
  font-size: 0.68rem;
  color: var(--text-sub);
}

.hidden-input {
  display: none;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 1rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: 0;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.42rem 0.6rem;
  border-radius: 0.4rem;
  background: var(--surface-inset);
  border: 1px solid transparent;
}

.file-row:hover {
  border-color: var(--border-color);
}

.file-icon {
  color: var(--accent-purple);
  flex-shrink: 0;
}

.file-name {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.68rem;
  color: var(--text-sub);
}

.file-remove {
  border: none;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  display: inline-flex;
  padding: 0.15rem;
  border-radius: 3px;
}

.file-remove:hover {
  color: var(--accent-red);
  background: rgba(var(--rgb-red), 0.1);
}

.result-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.filter-tabs {
  display: flex;
  gap: 0.3rem;
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  padding: 0.22rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.filter-pill.active {
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-cyan), 0.4);
  background: rgba(var(--rgb-cyan), 0.1);
}

.pill-count {
  font-family: var(--font-mono);
  font-size: 0.64rem;
  opacity: 0.8;
}

.search-input-mini {
  flex: 1;
  min-width: 100px;
  padding: 0.32rem 0.55rem;
  font-size: 0.72rem;
}

.export-group {
  display: flex;
  gap: 0.25rem;
}

.export-btn {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 0.28rem 0.45rem;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.export-btn:hover {
  color: var(--accent-green);
  border-color: rgba(var(--rgb-green), 0.4);
  background: rgba(var(--rgb-green), 0.08);
}

.progress-strip {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 1rem;
  border-bottom: 1px solid var(--border-color);
}

.bar-track {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: var(--surface-inset-2);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-cyan), var(--primary));
  transition: width 0.2s ease;
}

.progress-text {
  font-size: 0.68rem;
  color: var(--text-sub);
}

.result-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  min-height: 0;
}

.result-item {
  display: flex;
  flex-direction: column;
}

.result-row {
  display: grid;
  grid-template-columns: 34px minmax(90px, 1fr) minmax(120px, 1.5fr) 68px 26px;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.55rem;
  border-radius: 0.4rem;
  background: var(--surface-inset);
  border: 1px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.result-row:hover {
  border-color: var(--border-color);
}

.result-row.expanded {
  border-color: rgba(var(--rgb-cyan), 0.4);
  background: rgba(var(--rgb-cyan), 0.06);
}

.result-row.is-error {
  background: rgba(var(--rgb-red), 0.07);
  border-color: rgba(var(--rgb-red), 0.22);
}

.row-index {
  font-size: 0.66rem;
  color: var(--text-sub);
}

.row-source {
  font-size: 0.72rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-output {
  font-size: 0.72rem;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-row.is-error .row-output {
  color: var(--accent-red);
}

.row-meta {
  font-size: 0.66rem;
  color: var(--text-sub);
  text-align: right;
}

.row-copy {
  border: none;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.15rem;
  border-radius: 3px;
}

.row-copy:hover {
  color: var(--accent-cyan);
  background: rgba(var(--rgb-cyan), 0.1);
}

.row-copy.disabled {
  color: var(--accent-red);
  cursor: default;
}

.row-detail {
  margin: 0.2rem 0 0.35rem 2.6rem;
  border: 1px solid var(--border-color);
  border-radius: 0.45rem;
  background: var(--surface-well);
  overflow: hidden;
}

.detail-pre {
  margin: 0;
  padding: 0.6rem 0.75rem;
  max-height: 200px;
  overflow: auto;
  font-size: 0.72rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-main);
}

.detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  border-top: 1px solid var(--border-color);
  background: var(--surface-inset);
}

.detail-meta {
  font-size: 0.66rem;
  color: var(--text-sub);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  color: var(--text-sub);
  font-size: 0.76rem;
  padding: 2rem 1rem;
  text-align: center;
}

.empty-state.small {
  padding: 0.8rem;
  font-size: 0.72rem;
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 0.68rem;
  opacity: 0.75;
}

.tool-tips {
  padding: 0.6rem 1rem;
}

.tip-content {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.7rem;
  color: var(--text-sub);
  line-height: 1.6;
}

.tip-badge {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-weight: 800;
  font-size: 0.62rem;
  padding: 0.12rem 0.4rem;
  border-radius: 3px;
  color: var(--accent-purple);
  border: 1px solid rgba(var(--rgb-purple), 0.35);
  background: rgba(var(--rgb-purple), 0.1);
}

.spin {
  animation: batch-spin 0.9s linear infinite;
}

@keyframes batch-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1080px) {
  .batch-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .result-row {
    grid-template-columns: 28px 1fr 26px;
  }
  .row-meta,
  .row-output {
    display: none;
  }
  .tool-toolbar {
    align-items: stretch;
  }
}
</style>
