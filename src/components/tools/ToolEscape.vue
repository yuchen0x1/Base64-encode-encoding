<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="mode-toggles">
        <button :class="['tab-pill', mode === 'escape' ? 'active' : '']" @click="mode = 'escape'">
          <span class="pill-dot"></span><span>转义 (ESCAPE)</span>
        </button>
        <button :class="['tab-pill', mode === 'unescape' ? 'active' : '']" @click="mode = 'unescape'">
          <span class="pill-dot"></span><span>还原 (UNESCAPE)</span>
        </button>
      </div>

      <div class="actions">
        <label class="param-item">
          <span class="param-label">风格:</span>
          <select v-model="style" class="select-cyber">
            <option value="c">C 风格 (\n \t \" \\)</option>
            <option value="unicode">Unicode 转义 (\uXXXX)</option>
            <option value="hex">Hex 转义 (\x41)</option>
          </select>
        </label>
        <button class="btn btn-secondary btn-sm" @click="swapInputOutput">🔄 倒换</button>
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
      </div>
    </div>

    <div class="workbench-grid">
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'escape' ? '原文输入 (RAW)' : '转义输入 (ESCAPED)' }}</span>
          <span class="stat-badge code-font">{{ input.length }} CHARS</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          :placeholder="mode === 'escape' ? '输入需要转义的原始文本...' : '输入需要还原的转义文本...'"
          spellcheck="false"
        ></textarea>
      </div>

      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'escape' ? '转义输出 (ESCAPED)' : '还原输出 (RAW)' }}</span>
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="copyOutput" :disabled="!output">
              {{ copied ? '已复制 ✔' : '一键复制' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="output"
          readonly
          class="textarea-control code-font output-textarea"
          :placeholder="mode === 'escape' ? '转义结果实时生成于此...' : '还原结果实时生成于此...'"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <div class="glass-panel tool-tips">
      <div class="tip-content">
        <span class="tip-badge">ENGINE INFO</span>
        <span>将特殊字符转换为可安全嵌入字符串字面量 / JSON / 代码的转义形式，或反向还原为可读文本。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { globalToast } from '../../composables/useToast.js'

const mode = ref('escape')
const style = ref('c')
const input = ref('你好，极客工具箱！\n第二行 \t "引号" \ 反斜杠')
const copied = ref(false)

function escapeC(str) {
  const map = {
    '\n': '\\n', '\r': '\\r', '\t': '\\t',
    '\b': '\\b', '\f': '\\f', '\v': '\\v',
    '\\': '\\\\', '"': '\\"', "'": "\\'"
  }
  return str.replace(/[\n\r\t\b\f\v\\"']/g, ch => map[ch])
}

function unescapeC(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\v/g, '\v')
    .replace(/\\\\/g, '\u0000')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\u0000/g, '\\')
}

function escapeUnicode(str) {
  return Array.from(str).map(ch => {
    const code = ch.codePointAt(0)
    return code > 0x7f ? `\\u${code.toString(16).padStart(4, '0')}` : ch
  }).join('')
}

function unescapeUnicode(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

function escapeHex(str) {
  return Array.from(str).map(ch => {
    const code = ch.charCodeAt(0)
    return code > 0x7f ? ch : `\\x${code.toString(16).padStart(2, '0')}`
  }).join('')
}

function unescapeHex(str) {
  return str.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

const output = computed(() => {
  if (!input.value) return ''
  const isEscape = mode.value === 'escape'
  switch (style.value) {
    case 'c':
      return isEscape ? escapeC(input.value) : unescapeC(input.value)
    case 'unicode':
      return isEscape ? escapeUnicode(input.value) : unescapeUnicode(input.value)
    case 'hex':
      return isEscape ? escapeHex(input.value) : unescapeHex(input.value)
    default:
      return input.value
  }
})

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
  globalToast('已复制到剪贴板')
}

function swapInputOutput() {
  if (!output.value) return
  input.value = output.value
  mode.value = mode.value === 'escape' ? 'unescape' : 'escape'
}
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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
.mode-toggles {
  display: flex;
  background: var(--bg-input);
  padding: 0.25rem;
  border-radius: 0.5rem;
  gap: 0.25rem;
  border: 1px solid var(--border-color);
}
.tab-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.95rem;
  font-size: 0.775rem;
  font-weight: 700;
  font-family: var(--font-mono);
  border-radius: 0.375rem;
  border: none;
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
  box-shadow: 0 0 12px rgba(var(--rgb-primary), 0.2);
}
.tab-pill.active .pill-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.param-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.param-label {
  color: var(--text-sub);
  font-size: 0.8rem;
  white-space: nowrap;
}
.select-cyber {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.4rem 0.75rem;
  border-radius: 0.4rem;
  font-size: 0.825rem;
  outline: none;
}
.workbench-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  flex: 1;
  min-height: 400px;
}
@media (max-width: 768px) {
  .workbench-grid {
    grid-template-columns: 1fr;
  }
}
.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: var(--surface-inset);
  border-bottom: 1px solid var(--border-color);
}
.panel-title {
  font-size: 0.85rem;
  font-weight: 700;
}
.panel-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.stat-badge {
  font-size: 0.75rem;
  color: var(--text-sub);
}
.textarea-control {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 1.25rem;
  resize: none;
  min-height: 280px;
  line-height: 1.6;
}
.output-textarea {
  background-color: transparent;
}
.tool-tips {
  padding: 0.75rem 1.25rem;
}
.tip-content {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.tip-badge {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.15);
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
}
</style>