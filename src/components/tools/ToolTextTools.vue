<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="actions">
        <button :class="['tab-pill', mode === 'dedupe' ? 'active' : '']" @click="mode = 'dedupe'">
          <span class="pill-dot"></span><span>行去重</span>
        </button>
        <button :class="['tab-pill', mode === 'case' ? 'active' : '']" @click="mode = 'case'">
          <span class="pill-dot"></span><span>大小写转换</span>
        </button>
        <button :class="['tab-pill', mode === 'clean' ? 'active' : '']" @click="mode = 'clean'">
          <span class="pill-dot"></span><span>清理空行</span>
        </button>
        <button :class="['tab-pill', mode === 'trim' ? 'active' : '']" @click="mode = 'trim'">
          <span class="pill-dot"></span><span>去首尾空格</span>
        </button>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
      </div>
    </div>

    <div class="workbench-grid">
      <!-- 输入区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">原文输入 (SOURCE)</span>
          <span class="stat-badge code-font">{{ stats.sourceChars }} 字符 · {{ stats.sourceLines }} 行</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          placeholder="在此输入需要处理的文本内容..."
          spellcheck="false"
        ></textarea>
      </div>

      <!-- 输出区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">处理输出 (RESULT)</span>
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
          placeholder="处理结果实时生成于此..."
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <!-- 实时统计面板 -->
    <div class="glass-panel stats-hud">
      <div class="stat-card" v-for="s in statItems" :key="s.label">
        <span class="stat-num code-font text-cyan">{{ s.value }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const mode = ref('dedupe')
const input = ref('')
const copied = ref(false)

const stats = computed(() => {
  const text = input.value
  return {
    sourceChars: text.length,
    sourceLines: text ? text.split('\n').length : 0,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
    uniqueChars: new Set(text).size
  }
})

const statItems = computed(() => [
  { label: '字符数', value: stats.value.sourceChars },
  { label: '行数', value: stats.value.sourceLines },
  { label: '单词数', value: stats.value.words },
  { label: '去重字符', value: stats.value.uniqueChars }
])

const output = computed(() => {
  const text = input.value
  if (!text) return ''
  switch (mode.value) {
    case 'dedupe':
      return [...new Set(text.split('\n'))].join('\n')
    case 'case':
      return text.toLowerCase()
    case 'clean':
      return text.split('\n').filter(line => line.trim() !== '').join('\n')
    case 'trim':
      return text.split('\n').map(line => line.trim()).join('\n')
    default:
      return text
  }
})

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
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
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.tab-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  font-size: 0.775rem;
  font-weight: 700;
  font-family: var(--font-mono);
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
  border-color: rgba(56, 189, 248, 0.35);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}
.tab-pill.active .pill-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
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
  background: rgba(3, 7, 18, 0.4);
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
.stats-hud {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.85rem;
  padding: 1rem 1.25rem;
}
.stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem;
  background: rgba(3, 7, 18, 0.4);
  border: 1px solid rgba(56, 189, 248, 0.15);
  border-radius: 0.45rem;
}
.stat-num {
  font-size: 1.25rem;
  font-weight: 800;
}
.stat-label {
  font-size: 0.7rem;
  color: var(--text-sub);
}
</style>