<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="tool-tabs" role="tablist" aria-label="JSON 工作区">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['workspace-tab', currentTab === tab.id ? 'active' : '']"
          role="tab"
          :aria-selected="currentTab === tab.id"
          @click="currentTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="fileInput?.click()">📂 导入文件</button>
        <button class="btn btn-secondary btn-sm" :disabled="!input" @click="exportJson">💾 导出</button>
        <button class="btn btn-secondary btn-sm" @click="loadSample">📝 示例</button>
        <button class="btn btn-secondary btn-sm" @click="clearInput">🗑️ 清空</button>
        <input
          ref="fileInput"
          class="hidden-file-input"
          type="file"
          accept="application/json,.json"
          aria-label="导入 JSON 文件"
          @change="handleFileImport"
        />
      </div>
    </div>

    <div v-if="error" class="cyber-status-bar error">
      <div class="status-left">
        <span class="status-dot error-dot"></span>
        <span role="alert">JSON 处理错误：{{ error }}</span>
      </div>
    </div>
    <div v-else-if="validationPending" class="cyber-status-bar" role="status">
      <div class="status-left">
        <span class="status-dot success-dot"></span>
        <span>正在后台校验 JSON…</span>
      </div>
    </div>
    <div v-else-if="isValid" class="cyber-status-bar success">
      <div class="status-left">
        <span class="status-dot success-dot"></span>
        <span>JSON STRUCTURE VALIDATED</span>
      </div>
      <div class="status-stats code-font">
        <span>KEYS: <strong class="text-cyan">{{ jsonStats.keys }}</strong></span>
        <span class="divider">|</span>
        <span>SIZE: <strong class="text-purple">{{ jsonStats.size }} KB</strong></span>
      </div>
    </div>
    <div v-else-if="input.trim()" class="cyber-status-bar error">
      <div class="status-left">
        <span class="status-dot error-dot"></span>
        <span role="alert">JSON 校验错误：{{ formatJsonError(input, validation.error) }}</span>
      </div>
    </div>

    <div v-if="workerBusy || advancedLoading" class="large-document-note" role="status">
      <span>{{ workerStatus || '正在后台处理 JSON…' }}</span>
      <button class="btn btn-secondary btn-sm" type="button" @click="cancelWorkerTasks">取消</button>
    </div>
    <div v-if="isLargeDocument" class="large-document-note" role="status">
      当前文档 {{ largeSizeText }}。树视图和 JSONPath 已停用，差异比较限制为 5000 项；超大结构请优先使用编辑器文本模式。
    </div>

    <template v-if="currentTab === 'editor'">
      <div class="glass-panel editor-container">
        <div class="editor-header">
          <div class="editor-heading">
            <span class="editor-filename code-font">data_stream.json</span>
            <span class="editor-mode code-font">JSON · UTF-8 · LOCAL</span>
          </div>
          <div class="editor-actions">
            <button class="btn btn-primary btn-sm" :disabled="isActionBusy" @click="formatJson">✨ 美化</button>
            <button class="btn btn-secondary btn-sm" :disabled="isActionBusy" @click="minifyJson">📦 压缩</button>
            <button class="btn btn-secondary btn-sm" :disabled="isActionBusy" @click="escapeJson">🔤 转义</button>
            <button class="btn btn-secondary btn-sm" :disabled="isActionBusy" @click="unescapeJson">↩️ 反转义</button>
            <button class="btn btn-secondary btn-sm" :disabled="isActionBusy" @click="sortJsonKeys">↕️ 排序键</button>
            <button class="btn btn-secondary btn-sm" :disabled="isActionBusy" @click="removeEmptyValues">🧹 清理空值</button>
            <button class="btn btn-secondary btn-sm" :disabled="isActionBusy" @click="generateTypeScript">TS 类型</button>
            <button class="btn btn-primary btn-sm" :disabled="!input" @click="copyCode">
              {{ copied ? '已复制 ✔' : '📋 复制' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font main-editor"
          wrap="off"
          placeholder="在此粘贴或输入 JSON 数据，如: { &quot;system&quot;: &quot;Toolbox Pro&quot;, &quot;status&quot;: &quot;ONLINE&quot; }..."
          spellcheck="false"
        ></textarea>
      </div>

      <div v-if="generatedTypeScript" class="glass-panel editor-container generated-editor">
        <div class="editor-header">
          <div class="editor-heading">
            <span class="editor-filename code-font">generated_types.ts</span>
            <span class="editor-mode code-font">TypeScript · Interfaces</span>
          </div>
          <button class="btn btn-primary btn-sm" @click="copyTypeScript">
            {{ typeCopied ? '已复制 ✔' : '📋 复制类型' }}
          </button>
        </div>
        <textarea
          v-model="generatedTypeScript"
          readonly
          class="textarea-control code-font main-editor generated-output"
          wrap="off"
          spellcheck="false"
        ></textarea>
      </div>
    </template>

    <section v-else-if="currentTab === 'tree'" class="glass-panel advanced-panel">
      <div class="advanced-header">
        <div>
          <h3>结构化树视图</h3>
          <p>默认展开两层；点击路径或值可复制。对象键顺序不影响 JSON 语义。</p>
        </div>
        <span class="advanced-stat code-font">{{ jsonStats.keys }} KEYS · {{ jsonStats.size }} KB</span>
      </div>
      <div v-if="isLargeDocument" class="empty-state" role="status">
        文档超过 5 MiB，已关闭树渲染以保护界面响应；请使用编辑器文本模式。
      </div>
      <div v-else-if="advancedLoading" class="empty-state" role="status">
        正在后台准备 JSON 结构…
      </div>
      <div v-else-if="!advancedDocument.ok" class="empty-state" role="alert">
        {{ advancedDocument.error }}
      </div>
      <div v-else class="tree-viewport">
        <JsonTree :node="advancedDocument.value" :default-expand-depth="2" />
      </div>
    </section>

    <section v-else-if="currentTab === 'path'" class="glass-panel advanced-panel">
      <div class="advanced-header">
        <div>
          <h3>JSONPath 查询</h3>
          <p>支持 $.key、['key']、[0]、[*]、切片和递归 ..key / ..*；结果上限 1000 条。</p>
        </div>
      </div>
      <div class="query-bar">
        <input
          v-model="jsonPathExpression"
          class="input-control code-font"
          spellcheck="false"
          aria-label="JSONPath 表达式"
          placeholder="例如 $.items[*].name"
          @keydown.enter="runJsonPath"
        />
        <button class="btn btn-primary btn-sm" :disabled="isActionBusy || advancedLoading || isLargeDocument" @click="runJsonPath">查询</button>
        <button class="btn btn-secondary btn-sm" :disabled="!pathResult?.ok" @click="copyPathResults">复制结果</button>
      </div>
      <div v-if="isLargeDocument" class="empty-state" role="status">
        文档超过 5 MiB，已停止 JSONPath 结构化遍历；请先在编辑器中缩小数据。
      </div>
      <div v-else-if="advancedLoading" class="empty-state" role="status">
        正在后台准备 JSON 结构…
      </div>
      <div class="path-examples" aria-label="JSONPath 示例">
        <button
          v-for="example in pathExamples"
          :key="example"
          class="example-chip code-font"
          :disabled="isActionBusy || advancedLoading || isLargeDocument"
          @click="jsonPathExpression = example; runJsonPath()"
        >
          {{ example }}
        </button>
      </div>
      <div v-if="isLargeDocument" class="empty-state">
        大文档不执行 JSONPath 查询。
      </div>
      <div v-else-if="pathResult && !pathResult.ok" class="empty-state error-text" role="alert">
        {{ pathResult.error }}
      </div>
      <div v-else-if="pathResult" class="path-results">
        <div class="result-summary">
          命中 <strong>{{ pathResult.count }}</strong> 项
        </div>
        <div v-if="pathResult.count === 0" class="empty-state">没有匹配节点。</div>
        <article v-for="(result, index) in pathResult.results" :key="`${result.path}-${index}`" class="path-result-card">
          <div class="result-path-row">
            <span class="result-path code-font">{{ result.path }}</span>
            <div class="result-actions">
              <button class="btn btn-secondary btn-sm" @click="copyTextValue(result.path)">复制路径</button>
              <button class="btn btn-secondary btn-sm" @click="copyTextValue(stringifyValue(result.value))">复制值</button>
            </div>
          </div>
          <pre class="result-value code-font">{{ formatJsonValuePreview(result.value, 1000) }}</pre>
        </article>
      </div>
      <div v-else class="empty-state">输入表达式后按 Enter 或点击查询。</div>
    </section>

    <section v-else class="glass-panel advanced-panel">
      <div class="advanced-header">
        <div>
          <h3>结构化差异对比</h3>
          <p>对象键按无序比较；数组按下标比较。新增、删除、改值分别统计。</p>
        </div>
        <div class="actions">
          <button class="btn btn-secondary btn-sm" @click="compareFileInput?.click()">📂 导入对比文件</button>
          <button class="btn btn-secondary btn-sm" :disabled="!diffResult?.ok" @click="copyDiffReport">复制报告</button>
          <button class="btn btn-primary btn-sm" :disabled="isActionBusy || advancedLoading" @click="runDiff">开始对比</button>
          <input
            ref="compareFileInput"
            class="hidden-file-input"
            type="file"
            accept="application/json,.json"
            aria-label="导入用于对比的 JSON 文件"
            @change="handleCompareFileImport"
          />
        </div>
      </div>
      <div class="diff-input-grid">
        <label class="diff-input-card">
          <span>原始 JSON（当前文档）</span>
          <pre class="diff-source-preview code-font">{{ previewText(input) }}</pre>
        </label>
        <label class="diff-input-card">
          <span>对比 JSON</span>
          <textarea
            v-model="compareInput"
            class="textarea-control code-font diff-textarea"
            spellcheck="false"
            placeholder="粘贴第二份 JSON..."
          ></textarea>
        </label>
      </div>
      <div v-if="diffResult && !diffResult.ok" class="empty-state error-text" role="alert">
        {{ diffResult.error }}
      </div>
      <template v-else-if="diffResult">
        <div class="diff-summary">
          <span class="diff-pill added">新增 {{ diffResult.counts.added }}</span>
          <span class="diff-pill removed">删除 {{ diffResult.counts.removed }}</span>
          <span class="diff-pill changed">修改 {{ diffResult.counts.changed }}</span>
          <span class="diff-pill neutral">比较 {{ diffResult.nodesCompared }} 个节点</span>
        </div>
        <div v-if="diffResult.equal" class="empty-state success-text">两份 JSON 结构一致，无差异。</div>
        <div v-else class="diff-change-list">
          <article v-for="(change, index) in diffResult.changes" :key="`${change.path}-${change.type}-${index}`" :class="['diff-change', change.type]">
            <div class="diff-change-head">
              <span class="diff-kind">{{ changeKindLabel(change.type) }}</span>
              <span class="diff-path code-font">{{ change.path }}</span>
            </div>
            <div class="diff-values">
              <pre v-if="change.type !== 'added'" class="diff-before code-font">{{ formatJsonValuePreview(change.before, 500) }}</pre>
              <pre v-if="change.type !== 'removed'" class="diff-after code-font">{{ formatJsonValuePreview(change.after, 500) }}</pre>
            </div>
          </article>
        </div>
      </template>
      <div v-else class="empty-state">点击“开始对比”生成结构化差异。</div>
    </section>
  </div>
</template>

<script setup>
import { computed, onActivated, onDeactivated, onUnmounted, ref, watch } from 'vue'
import { copyText } from '../../utils/clipboard.js'
import { globalToast } from '../../composables/useToast.js'
import { createJsonWorkerClient } from '../../utils/jsonWorkerClient.js'
import { runJsonWorkerTask } from '../../utils/jsonWorkerTasks.js'
import { revokeObjectURLAfter } from '../../utils/objectUrl.js'
import JsonTree from './JsonTree.vue'
import {
  JSON_ADVANCED_MAX_BYTES,
  JSON_LARGE_DOCUMENT_BYTES,
  JSON_MAX_DOCUMENT_BYTES,
  JSON_WORKER_THRESHOLD_BYTES,
  countJsonKeys,
  formatJsonError,
  formatJsonValuePreview,
  jsonByteLength,
  parseJson,
  parseJsonForMutation,
  unescapeJsonString
} from './jsonTool.js'

const tabs = [
  { id: 'editor', label: '编辑器' },
  { id: 'tree', label: '树视图' },
  { id: 'path', label: 'JSONPath' },
  { id: 'diff', label: '差异对比' }
]

const input = ref(`{
  "system": "极客工具箱 (ToolBox Pro)",
  "version": "1.2.0-ULTRA",
  "engine": "Local-First Sandbox",
  "architecture": {
    "desktop": "Electron Windows",
    "renderer": "Vite + Vue 3"
  },
  "modules": {
    "totalTools": 21,
    "activeEngine": "Local-First",
    "cyberMode": true
  },
  "security": {
    "csp": "SELF + INLINE + HTTPS CONNECT",
    "xssDefense": true,
    "cloudTelemetry": "DISABLED"
  }
}`)
const compareInput = ref('')
const currentTab = ref('editor')
const copied = ref(false)
const typeCopied = ref(false)
const generatedTypeScript = ref('')
const error = ref('')
const fileInput = ref(null)
const compareFileInput = ref(null)
const jsonPathExpression = ref('$.architecture.*')
const pathResult = ref(null)
const diffResult = ref(null)
const pathExamples = ['$', '$.architecture.*', '$.modules.totalTools', '$..desktop']

function analyzeJsonText(text) {
  const parsed = parseJson(text)
  return parsed.ok
    ? { ok: true, keys: countJsonKeys(parsed.value) }
    : { ok: false, error: parsed.error }
}

const initialAnalysis = analyzeJsonText(input.value)
const validation = ref(initialAnalysis)
const validationPending = ref(false)
const jsonOperationBusy = ref(false)
const isValid = computed(() => input.value.trim().length > 0 && validation.value.ok)
const byteSize = computed(() => jsonByteLength(input.value))
const isLargeDocument = computed(() => byteSize.value > JSON_LARGE_DOCUMENT_BYTES)
const largeSizeText = computed(() => `${(byteSize.value / 1024 / 1024).toFixed(2)} MiB`)
const jsonStats = ref({
  keys: initialAnalysis.ok ? initialAnalysis.keys : 0,
  size: (jsonByteLength(input.value) / 1024).toFixed(2)
})
const advancedDocument = ref({ ok: false, error: '选择树视图或 JSONPath 后解析文档' })
const advancedLoading = ref(false)
const workerBusy = ref(false)
const isActionBusy = computed(() => workerBusy.value || jsonOperationBusy.value)
const workerStatus = ref('')
const jsonWorkerClient = createJsonWorkerClient()
let validationTimer = null
let validationRevision = 0
let advancedRevision = 0
let workerGeneration = 0
let activeWorkerTasks = 0
let retryValidationOnActivate = false
let retryAdvancedOnActivate = false

function stopWorkerTasks() {
  workerGeneration += 1
  if (validationTimer) clearTimeout(validationTimer)
  validationTimer = null
  jsonWorkerClient.cancel()
  activeWorkerTasks = 0
  workerBusy.value = false
  workerStatus.value = ''
  advancedLoading.value = false
}

async function runWorkerTask(type, payload, fallback, status) {
  const generation = workerGeneration
  activeWorkerTasks += 1
  workerBusy.value = true
  workerStatus.value = status
  try {
    const result = await jsonWorkerClient.request(type, payload)
    return generation === workerGeneration ? result : null
  } catch (workerError) {
    if (generation !== workerGeneration || workerError.name === 'AbortError') return null
    const fallbackSize = jsonByteLength(
      typeof payload.text === 'string'
        ? payload.text
        : `${payload.leftText || ''}${payload.rightText || ''}`
    )
    if (fallbackSize <= JSON_WORKER_THRESHOLD_BYTES) return fallback()
    workerStatus.value = '后台处理模块不可用，请重试或缩小文档。'
    return { ok: false, error: workerStatus.value }
  } finally {
    if (generation === workerGeneration) {
      activeWorkerTasks = Math.max(0, activeWorkerTasks - 1)
      workerBusy.value = activeWorkerTasks > 0
      if (!workerBusy.value && !advancedLoading.value && !validationPending.value) workerStatus.value = ''
    }
  }
}

function applyAnalysis(text, result) {
  validation.value = result.ok
    ? { ok: true }
    : { ok: false, error: result.error instanceof Error ? result.error : new Error(result.error) }
  jsonStats.value = {
    keys: result.ok ? result.keys : 0,
    size: (jsonByteLength(text) / 1024).toFixed(2)
  }
}

function scheduleValidation(text) {
  validationRevision += 1
  const revision = validationRevision
  const size = jsonByteLength(text)
  jsonStats.value = { keys: 0, size: (size / 1024).toFixed(2) }

  if (!text.trim()) {
    validation.value = { ok: false, error: new Error('JSON 内容为空') }
    validationPending.value = false
    return
  }
  if (size > JSON_MAX_DOCUMENT_BYTES) {
    validation.value = { ok: false, error: new Error('JSON 文档超过 32 MiB 处理上限') }
    validationPending.value = false
    return
  }
  if (size <= JSON_WORKER_THRESHOLD_BYTES) {
    const result = analyzeJsonText(text)
    applyAnalysis(text, result)
    validationPending.value = false
    return
  }

  validationPending.value = true
  validationTimer = setTimeout(async () => {
    validationTimer = null
    const result = await runWorkerTask(
      'analyze',
      { text },
      () => analyzeJsonText(text),
      '正在后台校验 JSON…'
    )
    if (revision !== validationRevision || !result) return
    applyAnalysis(text, result)
    validationPending.value = false
    if (!workerBusy.value && !advancedLoading.value) workerStatus.value = ''
  }, 120)
}

function prepareAdvancedDocument(text, tab) {
  advancedRevision += 1
  const revision = advancedRevision
  if (tab !== 'tree') {
    advancedDocument.value = { ok: false, error: '选择树视图后解析文档' }
    advancedLoading.value = false
    return
  }
  const size = jsonByteLength(text)
  if (size > JSON_LARGE_DOCUMENT_BYTES) {
    advancedDocument.value = { ok: false, error: '文档超过 5 MiB，已停止结构化遍历' }
    advancedLoading.value = false
    return
  }
  if (size > JSON_ADVANCED_MAX_BYTES) {
    advancedDocument.value = { ok: false, error: `文档超过 ${(JSON_ADVANCED_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB 结构化操作上限` }
    advancedLoading.value = false
    return
  }

  if (size <= JSON_WORKER_THRESHOLD_BYTES) {
    const parsed = parseJsonForMutation(text)
    advancedDocument.value = parsed.ok
      ? parsed
      : { ok: false, error: formatJsonError(text, parsed.error) }
    advancedLoading.value = false
    return
  }

  advancedLoading.value = true
  runWorkerTask(
    'structure',
    { text },
    () => {
      const parsed = parseJsonForMutation(text)
      return parsed.ok ? parsed : { ok: false, error: parsed.error.message || 'JSON 结构无效' }
    },
    '正在后台准备 JSON 结构…'
  ).then(result => {
    if (revision !== advancedRevision || !result) return
    advancedDocument.value = result.ok
      ? result
      : { ok: false, error: formatJsonError(text, result.error) }
    advancedLoading.value = false
    if (!workerBusy.value && !validationPending.value) workerStatus.value = ''
  })
}

watch(input, text => {
  stopWorkerTasks()
  error.value = ''
  generatedTypeScript.value = ''
  copied.value = false
  typeCopied.value = false
  pathResult.value = null
  diffResult.value = null
  advancedDocument.value = { ok: false, error: 'JSON 已更改，正在准备结构' }
  scheduleValidation(text)
})
watch([input, currentTab], ([text, tab]) => prepareAdvancedDocument(text, tab))

function cancelWorkerTasks() {
  const wasValidating = validationPending.value
  validationRevision += 1
  advancedRevision += 1
  stopWorkerTasks()
  validationPending.value = false
  if (wasValidating) validation.value = { ok: false, error: new Error('JSON 校验已取消') }
  error.value = '后台处理已取消'
}

function deactivateWorkerTasks() {
  retryValidationOnActivate = validationPending.value
  retryAdvancedOnActivate = currentTab.value === 'tree' &&
    (advancedLoading.value || advancedDocument.value.ok)
  const explicitTaskWasRunning = workerBusy.value && !retryValidationOnActivate && !retryAdvancedOnActivate

  validationRevision += 1
  advancedRevision += 1
  stopWorkerTasks()
  validationPending.value = false
  if (retryValidationOnActivate) {
    validation.value = { ok: false, error: new Error('后台校验已取消，重新打开工具后会自动重试') }
  }
  if (retryAdvancedOnActivate) {
    advancedDocument.value = { ok: false, error: '结构准备已取消，重新打开工具后会自动重试' }
  } else {
    advancedDocument.value = { ok: false, error: '选择树视图后解析文档' }
  }
  if (explicitTaskWasRunning) {
    error.value = '后台操作因切换工具而取消；输入和已有结果已保留'
  }
}

function reactivateWorkerTasks() {
  if (retryValidationOnActivate) {
    retryValidationOnActivate = false
    scheduleValidation(input.value)
  }
  if (retryAdvancedOnActivate) {
    retryAdvancedOnActivate = false
    prepareAdvancedDocument(input.value, currentTab.value)
  }
}

onActivated(reactivateWorkerTasks)
onDeactivated(deactivateWorkerTasks)

onUnmounted(() => {
  retryValidationOnActivate = false
  retryAdvancedOnActivate = false
  validationRevision += 1
  advancedRevision += 1
  stopWorkerTasks()
})

function setErrorDetail(errorObject) {
  error.value = formatJsonError(input.value, errorObject)
}

async function executeJsonTask(type, payload) {
  const size = type === 'diff'
    ? Math.max(jsonByteLength(payload.leftText), jsonByteLength(payload.rightText))
    : jsonByteLength(payload.text)
  if (size > JSON_MAX_DOCUMENT_BYTES) return { ok: false, error: 'JSON 文档超过 32 MiB 处理上限' }
  if (type === 'diff' && size > JSON_ADVANCED_MAX_BYTES) {
    return { ok: false, error: '参与对比的每份 JSON 都不能超过 16 MiB' }
  }

  const fallback = () => runJsonWorkerTask(type, payload)
  if (size <= JSON_WORKER_THRESHOLD_BYTES) return fallback()
  return runWorkerTask(type, payload, fallback, `正在后台${type === 'diff' ? '比较' : '处理'} JSON…`)
}

async function applyJsonTextTask(type, successMessage) {
  if (jsonOperationBusy.value) return
  jsonOperationBusy.value = true
  error.value = ''
  const source = input.value
  try {
    const result = await executeJsonTask(type, { text: source })
    if (!result || input.value !== source) return
    if (!result.ok) {
      setErrorDetail(result.error)
      return
    }
    input.value = result.value
    generatedTypeScript.value = ''
    globalToast(successMessage)
  } finally {
    jsonOperationBusy.value = false
  }
}

function formatJson() { return applyJsonTextTask('format', 'JSON 已格式化') }

function minifyJson() { return applyJsonTextTask('minify', 'JSON 已压缩') }

function escapeJson() {
  input.value = JSON.stringify(input.value)
  generatedTypeScript.value = ''
}

function unescapeJson() {
  error.value = ''
  const result = unescapeJsonString(input.value)
  if (!result.ok) {
    setErrorDetail(result.error instanceof TypeError ? new Error('JSON 值必须是字符串') : result.error)
    return
  }
  input.value = result.value
  generatedTypeScript.value = ''
}

function sortJsonKeys() { return applyJsonTextTask('sort', 'JSON 键名已排序') }

function removeEmptyValues() { return applyJsonTextTask('remove-empty', '空值已清理') }

async function generateTypeScript() {
  if (jsonOperationBusy.value) return
  jsonOperationBusy.value = true
  error.value = ''
  const source = input.value
  try {
    const result = await executeJsonTask('typescript', { text: source })
    if (!result || input.value !== source) return
    if (!result.ok) {
      setErrorDetail(result.error)
      return
    }
    generatedTypeScript.value = result.value
    globalToast('TypeScript 类型已生成')
  } finally {
    jsonOperationBusy.value = false
  }
}

function loadSample() {
  input.value = JSON.stringify({
    node_id: 'CYBER-NODE-01',
    timestamp: Date.now(),
    status: 'ACTIVE',
    metrics: {
      cpu_usage: '1.2%',
      memory_heap: '34MB',
      response_latency_ms: 0.12
    },
    protocols: ['TLS_1.3', 'LOCAL_SANDBOX'],
    unicode: '中文 🚀'
  }, null, 2)
  compareInput.value = JSON.stringify({
    node_id: 'CYBER-NODE-01',
    timestamp: Date.now(),
    status: 'STANDBY',
    metrics: {
      cpu_usage: '0.8%',
      memory_heap: '32MB'
    },
    protocols: ['TLS_1.3'],
    unicode: '中文 🚀'
  }, null, 2)
  error.value = ''
  generatedTypeScript.value = ''
}

function clearInput() {
  input.value = ''
  compareInput.value = ''
  generatedTypeScript.value = ''
  error.value = ''
  pathResult.value = null
  diffResult.value = null
}

async function copyCode() {
  if (!input.value || !await copyText(input.value)) return
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
  globalToast('JSON 已复制到剪贴板')
}

async function copyTypeScript() {
  if (!generatedTypeScript.value || !await copyText(generatedTypeScript.value)) return
  typeCopied.value = true
  setTimeout(() => (typeCopied.value = false), 2000)
  globalToast('TypeScript 类型已复制')
}

async function handleFileImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > JSON_ADVANCED_MAX_BYTES) {
    error.value = `文件超过 ${(JSON_ADVANCED_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB 上限`
    globalToast(error.value, 'error')
    return
  }
  try {
    input.value = await file.text()
    currentTab.value = 'editor'
    globalToast(`已导入 ${file.name}`)
  } catch (importError) {
    error.value = `读取文件失败：${importError.message}`
  }
}

async function handleCompareFileImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > JSON_ADVANCED_MAX_BYTES) {
    diffResult.value = { ok: false, error: `对比文件超过 ${(JSON_ADVANCED_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB 上限` }
    return
  }
  try {
    compareInput.value = await file.text()
    globalToast(`已载入对比文件 ${file.name}`)
  } catch (importError) {
    diffResult.value = { ok: false, error: `读取对比文件失败：${importError.message}` }
  }
}

function exportJson() {
  if (!input.value) return
  const blob = new Blob([input.value], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `geek-toolbox-json-${Date.now()}.json`
  link.click()
  revokeObjectURLAfter(url)
  globalToast('JSON 文件已导出')
}

async function runJsonPath() {
  if (isActionBusy.value || advancedLoading.value) return
  if (isLargeDocument.value) {
    pathResult.value = { ok: false, error: '文档超过 5 MiB，已停止 JSONPath 结构化遍历' }
    return
  }
  const source = input.value
  const expression = jsonPathExpression.value
  jsonOperationBusy.value = true
  try {
    const result = await executeJsonTask('path', { text: source, expression })
    if (!result || input.value !== source || jsonPathExpression.value !== expression) return
    pathResult.value = result.ok
      ? result.value
      : { ok: false, error: formatJsonError(source, result.error) }
  } finally {
    jsonOperationBusy.value = false
  }
}

async function runDiff() {
  if (isActionBusy.value || advancedLoading.value) return
  const leftText = input.value
  const rightText = compareInput.value
  jsonOperationBusy.value = true
  try {
    const result = await executeJsonTask('diff', { leftText, rightText })
    if (!result || input.value !== leftText || compareInput.value !== rightText) return
    if (!result.ok) {
      const source = result.side === 'right' ? rightText : leftText
      const label = result.side === 'right' ? '对比 JSON' : '原始 JSON'
      diffResult.value = { ok: false, error: `${label}：${formatJsonError(source, result.error)}` }
      return
    }
    diffResult.value = result.value
  } finally {
    jsonOperationBusy.value = false
  }
}

function stringifyValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function previewText(value, maxChars = 4000) {
  const text = String(value ?? '')
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…（预览已截断）` : text || '(空)'
}

async function copyTextValue(value) {
  if (!await copyText(value)) return
  globalToast('已复制')
}

async function copyPathResults() {
  if (!pathResult.value?.ok) return
  const payload = JSON.stringify(
    pathResult.value.results.map(result => ({ path: result.path, value: result.value })),
    null,
    2
  )
  await copyTextValue(payload)
}

async function copyDiffReport() {
  if (!diffResult.value?.ok) return
  await copyTextValue(JSON.stringify({
    counts: diffResult.value.counts,
    changes: diffResult.value.changes
  }, null, 2))
}

function changeKindLabel(type) {
  return type === 'added' ? '新增' : type === 'removed' ? '删除' : '修改'
}
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
  padding: 0.75rem 1rem;
}
.tool-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.2rem;
  border: 1px solid var(--border-color);
  border-radius: 0.55rem;
  background: var(--surface-inset);
  flex-wrap: wrap;
}
.workspace-tab {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  padding: 0.35rem 0.7rem;
  border-radius: 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.workspace-tab.active {
  color: var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.12);
  border-color: rgba(var(--rgb-primary), 0.35);
}
.actions,
.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.hidden-file-input {
  display: none;
}
.cyber-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
  flex-wrap: wrap;
}
.cyber-status-bar.error {
  background: rgba(var(--rgb-red), 0.12);
  border: 1px solid rgba(var(--rgb-red), 0.35);
  color: var(--accent-red);
}
.cyber-status-bar.success {
  background: rgba(var(--rgb-green), 0.1);
  border: 1px solid rgba(var(--rgb-green), 0.3);
  color: var(--accent-green);
}
.status-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.error-dot {
  background: var(--accent-red);
}
.success-dot {
  background: var(--accent-green);
}
.status-stats {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-sub);
}
.divider {
  opacity: 0.4;
}
.large-document-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.85rem;
  border-left: 2px solid var(--accent-amber);
  background: rgba(var(--rgb-amber), 0.08);
  color: var(--text-muted);
  font-size: 0.78rem;
}
.editor-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 440px;
}
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
  background: var(--surface-inset-2);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}
.editor-heading {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.editor-filename {
  font-size: 0.75rem;
  color: var(--text-sub);
}
.editor-mode {
  font-size: 0.65rem;
  color: var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.1);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}
.generated-editor {
  min-height: 280px;
}
.main-editor {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 1.25rem;
  resize: none;
  line-height: 1.7;
  font-size: 0.9rem;
  background: transparent;
}
.text-cyan {
  color: var(--accent-cyan);
}
.text-purple {
  color: var(--accent-purple);
}
.advanced-panel {
  flex: 1;
  min-height: 420px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.advanced-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.advanced-header h3 {
  font-size: 1rem;
}
.advanced-header p {
  color: var(--text-muted);
  font-size: 0.78rem;
  margin-top: 0.25rem;
  max-width: 720px;
}
.advanced-stat {
  font-size: 0.72rem;
  color: var(--text-sub);
  padding: 0.25rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
.tree-viewport {
  flex: 1;
  max-height: 58vh;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.6rem;
  background: var(--surface-well);
}
.query-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.query-bar .input-control {
  flex: 1;
  min-width: 260px;
}
.path-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.example-chip {
  border: 1px solid var(--border-color);
  background: var(--surface-inset);
  color: var(--text-muted);
  border-radius: 9999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  cursor: pointer;
}
.example-chip:hover {
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-primary), 0.35);
}
.path-results,
.diff-change-list {
  flex: 1;
  overflow: auto;
  max-height: 52vh;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding-right: 0.2rem;
}
.result-summary {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.path-result-card {
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: var(--surface-inset);
  padding: 0.65rem 0.75rem;
}
.result-path-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.result-path {
  color: var(--accent-cyan);
  font-size: 0.76rem;
  overflow-wrap: anywhere;
}
.result-actions {
  display: flex;
  gap: 0.3rem;
}
.result-value {
  margin-top: 0.45rem;
  color: var(--text-muted);
  font-size: 0.75rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.empty-state {
  padding: 1.5rem;
  color: var(--text-sub);
  text-align: center;
  font-size: 0.82rem;
}
.error-text {
  color: var(--accent-red);
}
.success-text {
  color: var(--accent-green);
}
.diff-input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}
.diff-input-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.76rem;
  color: var(--text-muted);
}
.diff-source-preview,
.diff-textarea {
  min-height: 170px;
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: var(--surface-well);
  padding: 0.75rem;
  font-size: 0.75rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.diff-textarea {
  resize: vertical;
}
.diff-summary {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.diff-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
}
.diff-pill.added {
  color: var(--accent-green);
  background: rgba(var(--rgb-green), 0.1);
}
.diff-pill.removed {
  color: var(--accent-red);
  background: rgba(var(--rgb-red), 0.1);
}
.diff-pill.changed {
  color: var(--accent-amber);
  background: rgba(var(--rgb-amber), 0.1);
}
.diff-pill.neutral {
  color: var(--text-muted);
}
.diff-change {
  border: 1px solid var(--border-color);
  border-left-width: 3px;
  border-radius: 0.4rem;
  padding: 0.55rem 0.7rem;
  background: var(--surface-inset);
}
.diff-change.added {
  border-left-color: var(--accent-green);
}
.diff-change.removed {
  border-left-color: var(--accent-red);
}
.diff-change.changed {
  border-left-color: var(--accent-amber);
}
.diff-change-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.diff-kind {
  font-size: 0.68rem;
  font-weight: 800;
  color: var(--text-sub);
}
.diff-path {
  font-size: 0.73rem;
  color: var(--accent-cyan);
  overflow-wrap: anywhere;
}
.diff-values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-top: 0.45rem;
}
.diff-values pre {
  font-size: 0.72rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 0.4rem 0.5rem;
  border-radius: 0.3rem;
  background: var(--surface-well);
  max-height: 180px;
  overflow: auto;
}
.diff-before {
  color: var(--accent-red);
}
.diff-after {
  color: var(--accent-green);
}
@media (max-width: 900px) {
  .diff-input-grid,
  .diff-values {
    grid-template-columns: 1fr;
  }
}
</style>
