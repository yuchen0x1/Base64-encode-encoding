<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="formatJson">✨ 格式美化 (PRETTIFY)</button>
        <button class="btn btn-secondary btn-sm" @click="minifyJson">📦 压缩紧凑 (MINIFY)</button>
        <button class="btn btn-secondary btn-sm" @click="escapeJson">🔤 转义斜杠</button>
        <button class="btn btn-secondary btn-sm" @click="unescapeJson">↩️ 去除转义</button>
        <button class="btn btn-secondary btn-sm" @click="sortJsonKeys">↕️ 键名排序</button>
        <button class="btn btn-secondary btn-sm" @click="removeEmptyValues">🧹 清理空值</button>
        <button class="btn btn-secondary btn-sm" @click="generateTypeScript">TS 类型</button>
        <button class="btn btn-secondary btn-sm" @click="loadSample">📝 加载科技示例</button>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
        <button class="btn btn-primary btn-sm" @click="copyCode" :disabled="!input">
          {{ copied ? '已复制 ✔' : '📋 复制结果' }}
        </button>
      </div>
    </div>

    <!-- 状态指示条 HUD -->
    <div v-if="error" class="cyber-status-bar error">
      <div class="status-left">
        <span class="status-dot error-dot"></span>
        <span>JSON SYNTAX ERROR: {{ error }}</span>
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

    <!-- 代码编辑器视口 -->
    <div class="glass-panel editor-container">
      <div class="editor-header">
        <div class="mac-dots">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <span class="editor-filename code-font">data_stream.json</span>
        <span class="editor-mode code-font">JSON · UTF-8</span>
      </div>
      <textarea
        v-model="input"
        class="textarea-control code-font main-editor"
        placeholder="在此粘贴或输入 JSON 数据，如: { &quot;system&quot;: &quot;Toolbox Pro&quot;, &quot;status&quot;: &quot;ONLINE&quot; }..."
        spellcheck="false"
      ></textarea>
    </div>

    <div v-if="generatedTypeScript" class="glass-panel editor-container generated-editor">
      <div class="editor-header">
        <div class="mac-dots">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <span class="editor-filename code-font">generated_types.ts</span>
        <div class="generated-actions">
          <span class="editor-mode code-font">TypeScript · Interfaces</span>
          <button class="btn btn-primary btn-sm" @click="copyTypeScript">
            {{ typeCopied ? '已复制 ✔' : '📋 复制类型' }}
          </button>
        </div>
      </div>
      <textarea
        v-model="generatedTypeScript"
        readonly
        class="textarea-control code-font main-editor generated-output"
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { globalToast } from '../../composables/useToast.js'

const input = ref(`{
  "system": "极客工具箱 (ToolBox Pro)",
  "version": "1.2.0-ULTRA",
  "engine": "Local-First Sandbox",
  "architecture": {
    "desktop": "Electron Native",
    "mobile": "Capacitor Hybrid",
    "web": "Vite + Vue 3 Ultra UI"
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
const copied = ref(false)
const typeCopied = ref(false)
const generatedTypeScript = ref('')
const error = ref('')

const isValid = computed(() => {
  if (!input.value.trim()) return false
  try {
    JSON.parse(input.value)
    return true
  } catch {
    return false
  }
})

const jsonStats = computed(() => {
  if (!isValid.value) return { keys: 0, size: 0 }
  try {
    const obj = JSON.parse(input.value)
    let keys = 0
    function countKeys(target) {
      if (typeof target === 'object' && target !== null) {
        for (let k in target) {
          keys++
          countKeys(target[k])
        }
      }
    }
    countKeys(obj)
    const size = (new TextEncoder().encode(input.value).length / 1024).toFixed(2)
    return { keys, size }
  } catch {
    return { keys: 0, size: 0 }
  }
})

function parseInput() {
  try {
    return JSON.parse(input.value)
  } catch (e) {
    error.value = e.message
    return null
  }
}

function formatJson() {
  error.value = ''
  const parsed = parseInput()
  if (parsed === null) return
  input.value = JSON.stringify(parsed, null, 2)
  generatedTypeScript.value = ''
  globalToast('JSON 已格式化')
}

function minifyJson() {
  error.value = ''
  const parsed = parseInput()
  if (parsed === null) return
  input.value = JSON.stringify(parsed)
  generatedTypeScript.value = ''
  globalToast('JSON 已压缩')
}

function escapeJson() {
  input.value = JSON.stringify(input.value)
  generatedTypeScript.value = ''
}

function unescapeJson() {
  error.value = ''
  try {
    input.value = JSON.parse(input.value)
    generatedTypeScript.value = ''
  } catch (e) {
    error.value = '无法反转义：' + e.message
  }
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys)
  if (value && typeof value === 'object') {
    return Object.keys(value).sort((a, b) => a.localeCompare(b)).reduce((result, key) => {
      result[key] = sortObjectKeys(value[key])
      return result
    }, {})
  }
  return value
}

function sortJsonKeys() {
  error.value = ''
  const parsed = parseInput()
  if (parsed === null) return
  input.value = JSON.stringify(sortObjectKeys(parsed), null, 2)
  globalToast('JSON 键名已排序')
}

function removeEmptyValuesFrom(value) {
  if (Array.isArray(value)) {
    return value.map(removeEmptyValuesFrom).filter(item => item !== null && item !== undefined && item !== '')
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((result, key) => {
      const next = removeEmptyValuesFrom(value[key])
      if (next !== null && next !== undefined && next !== '') result[key] = next
      return result
    }, {})
  }
  return value
}

function removeEmptyValues() {
  error.value = ''
  const parsed = parseInput()
  if (parsed === null) return
  input.value = JSON.stringify(removeEmptyValuesFrom(parsed), null, 2)
  globalToast('空值已清理')
}

function toTypeName(key) {
  const cleaned = key.replace(/[^a-zA-Z0-9_$]/g, '_')
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || 'Root'
}

function inferType(value, name, interfaces) {
  if (value === null) return 'unknown'
  if (Array.isArray(value)) {
    if (!value.length) return 'unknown[]'
    const types = [...new Set(value.map(item => inferType(item, `${name}Item`, interfaces)))]
    return types.length === 1 ? `${types[0]}[]` : `(${types.join(' | ')})[]`
  }
  if (typeof value === 'object') {
    const interfaceName = toTypeName(name)
    const fields = Object.entries(value).map(([key, item]) => {
      const type = inferType(item, `${interfaceName}${toTypeName(key)}`, interfaces)
      const optional = item === null ? '?' : ''
      return `  ${toTypeName(key)}${optional}: ${type};`
    })
    interfaces.push(`export interface ${interfaceName} {\n${fields.join('\n')}\n}`)
    return interfaceName
  }
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

function generateTypeScript() {
  error.value = ''
  const parsed = parseInput()
  if (parsed === null) return
  const interfaces = []
  const rootType = inferType(parsed, 'Root', interfaces)
  generatedTypeScript.value = `${interfaces.reverse().join('\n\n')}\n\nexport type RootData = ${rootType}`
  globalToast('TypeScript 类型已生成')
}

function loadSample() {
  input.value = JSON.stringify({
    node_id: "CYBER-NODE-01",
    timestamp: Date.now(),
    status: "ACTIVE",
    metrics: {
      cpu_usage: "1.2%",
      memory_heap: "34MB",
      response_latency_ms: 0.12
    },
    protocols: ["TLS_1.3", "LOCAL_SANDBOX"]
  }, null, 2)
  error.value = ''
  generatedTypeScript.value = ''
}

function copyCode() {
  if (!input.value) return
  navigator.clipboard.writeText(input.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
  globalToast('JSON 已复制到剪贴板')
}

function copyTypeScript() {
  if (!generatedTypeScript.value) return
  navigator.clipboard.writeText(generatedTypeScript.value)
  typeCopied.value = true
  setTimeout(() => (typeCopied.value = false), 2000)
  globalToast('TypeScript 类型已复制')
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
  padding: 0.85rem 1.25rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.cyber-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  font-family: var(--font-mono);
}
.cyber-status-bar.error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
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
  box-shadow: 0 0 6px var(--accent-red);
}
.success-dot {
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
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
  padding: 0.65rem 1.25rem;
  background: var(--surface-inset-2);
  border-bottom: 1px solid var(--border-color);
}
.mac-dots {
  display: flex;
  gap: 6px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot.red { background: #ef4444; }
.dot.yellow { background: var(--accent-amber); }
.dot.green { background: #10b981; }
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
.generated-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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
</style>
