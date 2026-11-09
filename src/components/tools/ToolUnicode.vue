<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="type-selectors">
        <button 
          :class="['tab-pill', targetType === 'unicode' ? 'active' : '']"
          @click="targetType = 'unicode'"
        >
          Unicode (\uXXXX)
        </button>
        <button 
          :class="['tab-pill', targetType === 'html-entity' ? 'active' : '']"
          @click="targetType = 'html-entity'"
        >
          HTML 实体 (&amp; / &lt; / &#x)
        </button>
      </div>

      <div class="mode-toggles">
        <button 
          :class="['tab-pill', mode === 'encode' ? 'active' : '']"
          @click="mode = 'encode'"
        >
          编码 (Encode)
        </button>
        <button 
          :class="['tab-pill', mode === 'decode' ? 'active' : '']"
          @click="mode = 'decode'"
        >
          解码 (Decode)
        </button>
      </div>

      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
        <button class="btn btn-secondary btn-sm" @click="swapInputOutput">🔄 倒换</button>
      </div>
    </div>

    <div class="workbench-grid">
      <!-- 输入区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'encode' ? '原始文本缓冲区' : '编码字符源' }}</span>
          <span class="stat-badge code-font">{{ input.length }} CHARS</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          :placeholder="mode === 'encode' ? '输入中英文、特殊符号进行编码转换...' : '输入 \\uXXXX 或 &lt; 等实体进行还原...'"
        ></textarea>
      </div>

      <!-- 输出区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'encode' ? '实体 / 转义编码输出' : '还原解码文本' }}</span>
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="copyOutput" :disabled="!output">
              {{ copied ? '已复制 ✔' : '📋 复制结果' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="output"
          readonly
          class="textarea-control code-font output-textarea"
          placeholder="转换结果实时渲染在此..."
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const targetType = ref('unicode')
const mode = ref('encode')
const input = ref('你好，极客工具箱！<Cyber & Hacker> 🚀')
const copied = ref(false)

function strToUnicode(str) {
  return str.split('').map(c => {
    const code = c.charCodeAt(0)
    if (code > 127) {
      return '\\u' + code.toString(16).padStart(4, '0')
    }
    return c
  }).join('')
}

function unicodeToStr(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
    return String.fromCharCode(parseInt(grp, 16))
  })
}

function strToHtmlEntities(str) {
  return str.replace(/[\u00A0-\u9999<>&"]/gim, function(i) {
    return '&#' + i.charCodeAt(0) + ';'
  })
}

function htmlEntitiesToStr(str) {
  const txt = document.createElement('textarea')
  txt.innerHTML = str
  return txt.value
}

const output = computed(() => {
  if (!input.value) return ''
  try {
    if (targetType.value === 'unicode') {
      return mode.value === 'encode' ? strToUnicode(input.value) : unicodeToStr(input.value)
    } else {
      return mode.value === 'encode' ? strToHtmlEntities(input.value) : htmlEntitiesToStr(input.value)
    }
  } catch (e) {
    return '解析异常'
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
  gap: 1.25rem;
}
.tool-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
}
.type-selectors, .mode-toggles {
  display: flex;
  background: var(--bg-input);
  padding: 0.25rem;
  border-radius: 0.5rem;
  gap: 0.25rem;
  border: 1px solid var(--border-color);
}
.tab-pill {
  padding: 0.35rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab-pill.active {
  background: var(--bg-card);
  color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(var(--rgb-primary), 0.2);
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.workbench-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
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
.stat-badge {
  font-size: 0.75rem;
  color: var(--text-sub);
}
.textarea-control {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 1.25rem;
  min-height: 280px;
  line-height: 1.6;
}
.output-textarea {
  background: transparent;
}
</style>
