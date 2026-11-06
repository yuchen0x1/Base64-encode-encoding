<template>
  <div class="tool-content">
    <div class="tool-toolbar">
      <div class="diff-summary">
        <span class="badge diff-add">+ {{ diffStats.added }} 新增</span>
        <span class="badge diff-del">- {{ diffStats.removed }} 删除</span>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="loadSample">📝 加载对比示例</button>
        <button class="btn btn-secondary btn-sm" @click="clearAll">🗑️ 清空</button>
      </div>
    </div>

    <!-- 文本输入区 -->
    <div class="workbench-grid">
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">原文本 / 旧版本 (Original)</span>
        </div>
        <textarea
          v-model="oldText"
          class="textarea-control code-font"
          placeholder="输入旧版本内容..."
        ></textarea>
      </div>

      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">新文本 / 新版本 (Modified)</span>
        </div>
        <textarea
          v-model="newText"
          class="textarea-control code-font"
          placeholder="输入新版本内容..."
        ></textarea>
      </div>
    </div>

    <!-- 差异高亮结果区 -->
    <div class="panel diff-result-panel">
      <div class="panel-header">
        <span class="panel-title">差异对比高亮 (Diff Result)</span>
      </div>
      <div class="diff-viewer code-font">
        <div
          v-for="(part, idx) in diffParts"
          :key="idx"
          :class="['diff-line', part.added ? 'diff-line-add' : part.removed ? 'diff-line-del' : 'diff-line-normal']"
        >
          <span class="line-marker">{{ part.added ? '+' : part.removed ? '-' : ' ' }}</span>
          <span class="line-text">{{ part.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import * as Diff from 'diff'

const oldText = ref(`function greeting(name) {
  console.log("Hello, " + name);
  return true;
}`)

const newText = ref(`function greeting(name, title = "Mr.") {
  console.log("Hello, " + title + " " + name);
  console.info("Greeting completed");
  return true;
}`)

const diffParts = computed(() => {
  return Diff.diffLines(oldText.value, newText.value)
})

const diffStats = computed(() => {
  let added = 0
  let removed = 0
  diffParts.value.forEach(part => {
    const lines = part.value.split('\n').filter(Boolean).length
    if (part.added) added += lines
    if (part.removed) removed += lines
  })
  return { added, removed }
})

function loadSample() {
  oldText.value = `const config = {
  env: "production",
  version: "1.0.0",
  debug: false
};`
  newText.value = `const config = {
  env: "development",
  version: "1.1.0",
  port: 8080,
  debug: true
};`
}

function clearAll() {
  oldText.value = ''
  newText.value = ''
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
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
}
.diff-summary {
  display: flex;
  gap: 0.5rem;
}
.diff-add {
  background: rgba(16, 185, 129, 0.15);
  color: var(--accent-green);
}
.diff-del {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
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
  padding: 0.625rem 1rem;
  background: var(--bg-input);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
  font-weight: 600;
}
.textarea-control {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 0.75rem;
  min-height: 180px;
}
.diff-result-panel {
  min-height: 250px;
}
.diff-viewer {
  padding: 0.75rem;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
}
.diff-line {
  display: flex;
  padding: 0.1rem 0.25rem;
  border-radius: 2px;
}
.diff-line-add {
  background-color: rgba(16, 185, 129, 0.18);
  color: #10b981;
}
.dark .diff-line-add {
  background-color: rgba(16, 185, 129, 0.22);
  color: #34d399;
}
.diff-line-del {
  background-color: rgba(239, 68, 68, 0.18);
  color: #ef4444;
  text-decoration: line-through;
}
.dark .diff-line-del {
  background-color: rgba(239, 68, 68, 0.22);
  color: #f87171;
}
.diff-line-normal {
  color: var(--text-muted);
}
.line-marker {
  width: 1.5rem;
  user-select: none;
  font-weight: 700;
}
.line-text {
  flex: 1;
}
</style>
