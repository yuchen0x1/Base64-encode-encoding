<template>
  <div class="tool-content">
    <!-- 顶部控制台 -->
    <div class="glass-panel tool-toolbar">
      <div class="mode-toggles">
        <button :class="['tab-pill', sourceMode === 'text' ? 'active' : '']" @click="switchMode('text')">
          <span class="pill-dot"></span>
          <span>文本批量</span>
        </button>
        <button :class="['tab-pill', sourceMode === 'file' ? 'active' : '']" @click="switchMode('file')">
          <span class="pill-dot"></span>
          <span>文件批量</span>
        </button>
      </div>

      <div class="op-picker">
        <span class="op-label">处理方式</span>
        <select v-model="operation" class="input-control op-select">
          <optgroup v-for="group in operations" :key="group.group" :label="group.group">
            <option v-for="op in group.items" :key="op.value" :value="op.value">{{ op.label }}</option>
          </optgroup>
        </select>
      </div>

      <div class="actions">
        <label v-if="operation.startsWith('base64')" class="cyber-checkbox">
          <input v-model="options.urlSafeBase64" type="checkbox" />
          <span class="check-box-custom"></span>
          <span>URL-Safe</span>
        </label>
        <label v-if="isHashOp" class="cyber-checkbox">
          <input v-model="options.upperHash" type="checkbox" />
          <span class="check-box-custom"></span>
          <span>大写输出</span>
        </label>
        <label v-if="sourceMode === 'text'" class="cyber-checkbox">
          <input v-model="options.skipEmpty" type="checkbox" />
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
        <button class="btn btn-secondary btn-sm" @click="clearAll">
          <Trash2 :size="14" />
          <span>清空</span>
        </button>
      </div>
    </div>

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
            class="textarea-control code-font batch-textarea"
            spellcheck="false"
            placeholder="每行一条待处理内容，例如：&#10;hello world&#10;极客工具箱&#10;https://toolhelper.cn/?q=测试"
          ></textarea>
          <div class="panel-foot">
            <button class="btn btn-secondary btn-sm" @click="loadSample">载入示例</button>
            <button class="btn btn-secondary btn-sm" @click="pasteFromClipboard">读取剪贴板</button>
            <span class="foot-tip">最多 {{ MAX_LINES }} 行，单条上限 2 MB</span>
          </div>
        </template>

        <template v-else>
          <div
            :class="['drop-zone', dragging ? 'dragging' : '']"
            @click="pickFiles"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <input ref="fileInput" type="file" multiple class="hidden-input" @change="onPickFiles" />
            <UploadCloud :size="28" />
            <p class="drop-title">拖拽文件到此处，或点击选择</p>
            <p class="drop-sub">支持多选；哈希 / Base64 单文件上限 {{ formatSize(MAX_FILE_BYTES) }}</p>
          </div>

          <div class="file-list">
            <div v-for="(item, index) in files" :key="item.id" class="file-row">
              <FileIcon :size="14" class="file-icon" />
              <span class="file-name" :title="item.name">{{ item.name }}</span>
              <span class="file-size code-font">{{ formatSize(item.size) }}</span>
              <button class="file-remove" title="移除" @click.stop="removeFile(index)">
                <X :size="13" />
              </button>
            </div>
            <div v-if="!files.length" class="empty-state small">尚未添加文件</div>
          </div>

          <div class="panel-foot">
            <button class="btn btn-secondary btn-sm" @click="pickFiles">选择文件</button>
            <button class="btn btn-secondary btn-sm" :disabled="!files.length" @click="files = []">清空列表</button>
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
            <button class="btn btn-secondary btn-sm" :disabled="!okCount" @click="copyAll">
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
          <input v-model="search" class="input-control search-input-mini" placeholder="筛选结果…" />
          <div class="export-group">
            <button class="export-btn" title="导出 TXT" @click="exportAs('txt')">TXT</button>
            <button class="export-btn" title="导出 CSV" @click="exportAs('csv')">CSV</button>
            <button class="export-btn" title="导出 JSON" @click="exportAs('json')">JSON</button>
          </div>
        </div>

        <div v-if="processing" class="progress-strip">
          <div class="bar-track">
            <span class="bar-fill" :style="{ width: `${progress}%` }"></span>
          </div>
          <span class="progress-text code-font">{{ processedCount }} / {{ totalCount }}</span>
        </div>

        <div class="result-list">
          <div v-for="row in visibleResults" :key="row.id" class="result-item">
            <div :class="['result-row', row.ok ? '' : 'is-error', expandedId === row.id ? 'expanded' : '']" @click="toggleRow(row)">
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
      </section>
    </div>

    <div class="glass-panel tool-tips">
      <div class="tip-content">
        <span class="tip-badge">BATCH ENGINE</span>
        <span>批量模式按行 / 按文件顺序处理，支持中途停止；哈希与编码基于原始字节，二进制文件同样适用。处理结果可导出为 TXT、CSV 或 JSON。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onUnmounted } from 'vue'
import CryptoJS from 'crypto-js'
import { globalToast } from '../../composables/useToast.js'
import {
  Play,
  Square,
  Trash2,
  Copy,
  ListChecks,
  UploadCloud,
  FileText as FileIcon,
  X,
  AlertTriangle,
  Loader2
} from 'lucide-vue-next'

const MAX_LINES = 1000
const MAX_LINE_BYTES = 2 * 1024 * 1024
const MAX_FILE_BYTES = 64 * 1024 * 1024
const DETAIL_LIMIT = 200000

const operations = [
  {
    group: '编码 / 解码',
    items: [
      { value: 'base64-encode', label: 'Base64 编码' },
      { value: 'base64-decode', label: 'Base64 解码' },
      { value: 'url-encode', label: 'URL 编码' },
      { value: 'url-decode', label: 'URL 解码' }
    ]
  },
  {
    group: '摘要哈希',
    items: [
      { value: 'md5', label: 'MD5 摘要' },
      { value: 'sha1', label: 'SHA-1 摘要' },
      { value: 'sha256', label: 'SHA-256 摘要' }
    ]
  },
  {
    group: 'JSON',
    items: [
      { value: 'json-format', label: 'JSON 格式化' },
      { value: 'json-minify', label: 'JSON 压缩' }
    ]
  }
]

const sourceMode = ref('text')
const textInput = ref('')
const files = ref([])
const operation = ref('base64-encode')
const filter = ref('all')
const search = ref('')
const expandedId = ref(null)
const processing = ref(false)
const progress = ref(0)
const processedCount = ref(0)
const totalCount = ref(0)
const dragging = ref(false)
const fileInput = ref(null)
const results = ref([])

const options = reactive({
  urlSafeBase64: false,
  upperHash: false,
  skipEmpty: true
})

let cancelRequested = false
let seed = 0
const nextId = () => ++seed

const isHashOp = computed(() => ['md5', 'sha1', 'sha256'].includes(operation.value))

const lines = computed(() => {
  const raw = textInput.value.split('\n')
  if (!options.skipEmpty) return raw
  return raw.filter((line) => line.trim() !== '')
})
const lineCount = computed(() => lines.value.length)
const textBytes = computed(() => new TextEncoder().encode(textInput.value).length)
const totalFileSize = computed(() => files.value.reduce((sum, item) => sum + item.size, 0))

const okCount = computed(() => results.value.filter((row) => row.ok).length)
const errorCount = computed(() => results.value.length - okCount.value)

const filterTabs = computed(() => [
  { value: 'all', label: '全部', count: results.value.length },
  { value: 'ok', label: '成功', count: okCount.value },
  { value: 'error', label: '失败', count: errorCount.value }
])

const visibleResults = computed(() => {
  let list = results.value
  if (filter.value === 'ok') list = list.filter((row) => row.ok)
  if (filter.value === 'error') list = list.filter((row) => !row.ok)
  const keyword = search.value.trim().toLowerCase()
  if (keyword) {
    list = list.filter((row) =>
      row.label.toLowerCase().includes(keyword) ||
      (row.output || '').toLowerCase().includes(keyword) ||
      (row.error || '').toLowerCase().includes(keyword)
    )
  }
  return list
})

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function preview(text) {
  const flat = String(text).replace(/\s+/g, ' ')
  return flat.length > 88 ? `${flat.slice(0, 88)}…` : flat
}

function detailText(row) {
  if (row.output.length <= DETAIL_LIMIT) return row.output
  return `${row.output.slice(0, DETAIL_LIMIT)}\n\n… 已截断显示，完整内容共 ${row.output.length} 字符，可通过「复制完整结果」获取`
}

/* ---------------- 编解码核心（全部基于字节，保证二进制安全） ---------------- */

function bytesToBase64(bytes, urlSafe = false) {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  let encoded = btoa(binary)
  if (urlSafe) encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encoded
}

function base64ToBytes(input) {
  let text = String(input).trim().replace(/\s+/g, '')
  text = text.replace(/-/g, '+').replace(/_/g, '/')
  while (text.length % 4 !== 0) text += '='
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function hashBytes(bytes, algorithm) {
  const wordArray = CryptoJS.lib.WordArray.create(bytes)
  let digest
  if (algorithm === 'md5') digest = CryptoJS.MD5(wordArray)
  else if (algorithm === 'sha1') digest = CryptoJS.SHA1(wordArray)
  else digest = CryptoJS.SHA256(wordArray)
  const hex = digest.toString(CryptoJS.enc.Hex)
  return options.upperHash ? hex.toUpperCase() : hex
}

function applyOperation(bytes, text, op) {
  switch (op) {
    case 'base64-encode':
      return bytesToBase64(bytes, options.urlSafeBase64)
    case 'base64-decode':
      return decodeUtf8(base64ToBytes(text))
    case 'url-encode':
      return encodeURIComponent(text)
    case 'url-decode':
      return decodeURIComponent(text)
    case 'md5':
    case 'sha1':
    case 'sha256':
      return hashBytes(bytes, op)
    case 'json-format':
      return JSON.stringify(JSON.parse(text), null, 2)
    case 'json-minify':
      return JSON.stringify(JSON.parse(text))
    default:
      throw new Error(`未知操作: ${op}`)
  }
}

/* ---------------- 交互 ---------------- */

function switchMode(mode) {
  if (processing.value) return
  sourceMode.value = mode
  results.value = []
  expandedId.value = null
}

function pickFiles() {
  fileInput.value?.click()
}

function addFiles(fileList) {
  const incoming = Array.from(fileList || [])
  if (!incoming.length) return
  const existing = new Set(files.value.map((item) => `${item.name}:${item.size}:${item.lastModified}`))
  for (const file of incoming) {
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (existing.has(key)) continue
    existing.add(key)
    files.value.push({
      id: nextId(),
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      file
    })
  }
}

function onDrop(event) {
  dragging.value = false
  addFiles(event.dataTransfer?.files)
}

function onPickFiles(event) {
  addFiles(event.target.files)
  event.target.value = ''
}

function removeFile(index) {
  files.value.splice(index, 1)
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) textInput.value = textInput.value ? `${textInput.value}\n${text}` : text
    else globalToast('剪贴板没有文本内容', 'error')
  } catch {
    globalToast('无法读取剪贴板，请检查浏览器权限', 'error')
  }
}

function loadSample() {
  if (operation.value.startsWith('json')) {
    textInput.value = '{"name":"极客工具箱","version":"1.2.0","offline":true}\n{"name":"batch","tags":["base64","hash"],"count":3}'
    return
  }
  textInput.value = [
    'hello world',
    '极客工具箱 · ToolBox Pro',
    'https://toolhelper.cn/?q=批量处理',
    'Base64 & Hash 批量模式'
  ].join('\n')
}

function clearAll() {
  if (processing.value) return
  textInput.value = ''
  files.value = []
  results.value = []
  expandedId.value = null
  progress.value = 0
  processedCount.value = 0
  totalCount.value = 0
  filter.value = 'all'
  search.value = ''
}

function toggleRow(row) {
  expandedId.value = expandedId.value === row.id ? null : row.id
}

async function copyRow(row) {
  if (!row.ok) return
  try {
    await navigator.clipboard.writeText(row.output)
    globalToast('结果已复制到剪贴板')
  } catch {
    globalToast('复制失败：浏览器拒绝访问剪贴板', 'error')
  }
}

async function copyAll() {
  const text = results.value.filter((row) => row.ok).map((row) => row.output).join('\n')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    globalToast(`已复制 ${okCount.value} 条结果`)
  } catch {
    globalToast('复制失败：浏览器拒绝访问剪贴板', 'error')
  }
}

function csvEscape(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function exportAs(format) {
  if (!results.value.length) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  let content = ''
  let mime = 'text/plain;charset=utf-8'
  let ext = 'txt'

  if (format === 'json') {
    content = JSON.stringify({
      operation: operation.value,
      generatedAt: new Date().toISOString(),
      total: results.value.length,
      rows: results.value.map((row) => ({
        index: row.index,
        source: row.source,
        ok: row.ok,
        output: row.ok ? row.output : null,
        error: row.ok ? null : row.error
      }))
    }, null, 2)
    mime = 'application/json;charset=utf-8'
    ext = 'json'
  } else if (format === 'csv') {
    const header = ['序号', '来源', '状态', '结果', '错误']
    const rows = results.value.map((row) => [
      row.index,
      row.source,
      row.ok ? '成功' : '失败',
      row.ok ? row.output : '',
      row.ok ? '' : row.error
    ])
    content = '\uFEFF' + [header, ...rows].map((cells) => cells.map(csvEscape).join(',')).join('\r\n')
    mime = 'text/csv;charset=utf-8'
    ext = 'csv'
  } else {
    content = results.value.map((row) =>
      row.ok
        ? `#${row.index} ${row.label}\n${row.output}`
        : `#${row.index} ${row.label}\n[失败] ${row.error}`
    ).join('\n\n')
    ext = 'txt'
  }

  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `batch-${operation.value}-${stamp}.${ext}`
  link.click()
  URL.revokeObjectURL(url)
  globalToast(`已导出 ${ext.toUpperCase()} 文件（${results.value.length} 条）`)
}

/* ---------------- 处理流程 ---------------- */

function cancel() {
  cancelRequested = true
  globalToast('已请求停止，当前条目处理完后中断', 'info')
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function start() {
  if (processing.value) return

  if (sourceMode.value === 'text') {
    if (!lines.value.length) {
      globalToast('请先输入待处理文本（每行一条）', 'error')
      return
    }
    if (lines.value.length > MAX_LINES) {
      results.value = [{
        id: nextId(), index: 1, source: '输入超限', label: '输入超限', ok: false,
        error: `单次最多 ${MAX_LINES} 行，当前 ${lines.value.length} 行`, output: '', sizeText: '—'
      }]
      return
    }
  } else if (!files.value.length) {
    globalToast('请先添加待处理的文件', 'error')
    return
  }

  processing.value = true
  cancelRequested = false
  results.value = []
  expandedId.value = null
  progress.value = 0
  processedCount.value = 0
  totalCount.value = sourceMode.value === 'text' ? lines.value.length : files.value.length

  try {
    if (sourceMode.value === 'text') await runTextBatch()
    else await runFileBatch()
  } finally {
    processing.value = false
    progress.value = 100
  }
}

async function runTextBatch() {
  const op = operation.value
  const list = lines.value
  let index = 0
  for (const line of list) {
    if (cancelRequested) break
    index += 1
    const startedAt = performance.now()
    const bytes = new TextEncoder().encode(line)
    const label = line.length > 60 ? `${line.slice(0, 60)}…` : line
    try {
      if (bytes.length > MAX_LINE_BYTES) throw new Error(`单条超过 ${formatSize(MAX_LINE_BYTES)} 限制`)
      const output = applyOperation(bytes, line, op)
      results.value.push({
        id: nextId(), index, source: line, label, ok: true, output,
        error: '', sizeText: formatSize(new TextEncoder().encode(output).length),
        ms: Math.round(performance.now() - startedAt)
      })
    } catch (error) {
      results.value.push({
        id: nextId(), index, source: line, label, ok: false, output: '',
        error: error.message || '处理失败', sizeText: '—', ms: 0
      })
    }
    processedCount.value = index
    progress.value = Math.round((index / list.length) * 100)
    if (index % 12 === 0) await tick()
  }
}

function readFileAsBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

async function runFileBatch() {
  const op = operation.value
  const list = [...files.value]
  let index = 0
  for (const item of list) {
    if (cancelRequested) break
    index += 1
    const startedAt = performance.now()
    try {
      if (item.size > MAX_FILE_BYTES) {
        throw new Error(`文件 ${formatSize(item.size)} 超过 ${formatSize(MAX_FILE_BYTES)} 限制`)
      }
      const bytes = await readFileAsBytes(item.file)
      const text = decodeUtf8(bytes)
      const output = applyOperation(bytes, text, op)
      results.value.push({
        id: nextId(),
        index,
        source: item.name,
        label: item.name,
        ok: true,
        output,
        error: '',
        sizeText: formatSize(new TextEncoder().encode(output).length),
        ms: Math.round(performance.now() - startedAt)
      })
    } catch (error) {
      results.value.push({
        id: nextId(), index, source: item.name, label: item.name,
        ok: false, output: '', error: error.message || '处理失败', sizeText: '—', ms: 0
      })
    }
    processedCount.value = index
    progress.value = Math.round((index / list.length) * 100)
    await tick()
  }
}

onUnmounted(() => {
  cancelRequested = true
})
</script>

<style scoped>
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
