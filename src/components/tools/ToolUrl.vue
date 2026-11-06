<template>
  <div class="tool-content">
    <div class="tool-toolbar">
      <div class="mode-toggles">
        <button 
          :class="['tab-pill', mode === 'encode' ? 'active' : '']"
          @click="mode = 'encode'"
        >
          URL 编码 (Encode)
        </button>
        <button 
          :class="['tab-pill', mode === 'decode' ? 'active' : '']"
          @click="mode = 'decode'"
        >
          URL 解码 (Decode)
        </button>
      </div>

      <div class="options-group">
        <label class="param-item">
          <span>编码范围:</span>
          <select v-model="encodeType" class="select-control">
            <option value="component">encodeURIComponent (推荐：含参数值所有字符)</option>
            <option value="uri">encodeURI (保留 ://?&= 等URL结构符)</option>
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
        <button class="btn btn-secondary btn-sm" @click="swapInputOutput">🔄 倒换</button>
      </div>
    </div>

    <div class="workbench-grid">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'encode' ? '待编码的 URL 或参数' : '待解码的编码串' }}</span>
          <span class="stat-badge">{{ input.length }} 字符</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          placeholder="请输入 URL 或带特殊字符的参数内容..."
        ></textarea>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">处理结果</span>
          <div class="panel-actions">
            <span v-if="error" class="error-badge">⚠️ {{ error }}</span>
            <button class="btn btn-primary btn-sm" @click="copyOutput" :disabled="!output">
              {{ copied ? '已复制 ✔' : '复制结果' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="output"
          readonly
          class="textarea-control code-font output-textarea"
          placeholder="URL 编解码结果..."
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const mode = ref('encode')
const encodeType = ref('component')
const input = ref('https://www.google.com/search?q=极客工具箱&from=desktop&ver=1.0#tools')
const copied = ref(false)
const error = ref('')

const output = computed(() => {
  error.value = ''
  if (!input.value) return ''
  try {
    if (mode.value === 'encode') {
      return encodeType.value === 'component' 
        ? encodeURIComponent(input.value) 
        : encodeURI(input.value)
    } else {
      return encodeType.value === 'component'
        ? decodeURIComponent(input.value)
        : decodeURI(input.value)
    }
  } catch (e) {
    error.value = 'URL 格式解析错误'
    return ''
  }
})

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function swapInputOutput() {
  if (!output.value) return
  input.value = output.value
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
}
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.tool-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
}
.mode-toggles {
  display: flex;
  background: var(--bg-input);
  padding: 0.25rem;
  border-radius: 0.5rem;
  gap: 0.25rem;
}
.tab-pill {
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.tab-pill.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}
.select-control {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.35rem 0.6rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  outline: none;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.workbench-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 768px) {
  .workbench-grid {
    grid-template-columns: 1fr;
  }
}
.panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  background: var(--bg-input);
  border-bottom: 1px solid var(--border-color);
}
.panel-title {
  font-size: 0.85rem;
  font-weight: 600;
}
.stat-badge {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.error-badge {
  font-size: 0.75rem;
  color: var(--accent-red);
}
.textarea-control {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 1rem;
  min-height: 250px;
}
.output-textarea {
  background-color: var(--bg-card);
}
</style>
