<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="formatSql">✨ 格式美化</button>
        <button class="btn btn-secondary btn-sm" @click="minifySql">📦 压缩 SQL</button>
        <button class="btn btn-secondary btn-sm" @click="loadSample">📝 加载示例</button>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
        <button class="btn btn-primary btn-sm" @click="copySql" :disabled="!input">
          {{ copied ? '已复制 ✔' : '📋 复制 SQL' }}
        </button>
      </div>
    </div>

    <div class="glass-panel editor-container">
      <div class="editor-header">
        <div class="mac-dots">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <span class="editor-filename code-font">query.sql</span>
        <span class="editor-mode code-font">SQL · LOCAL</span>
      </div>
      <textarea
        v-model="input"
        class="textarea-control code-font main-editor"
        placeholder="在此输入 SQL 查询，例如 SELECT id, name FROM users WHERE active = 1..."
        spellcheck="false"
      ></textarea>
    </div>

    <div class="glass-panel stats-bar">
      <span class="stat-item"><strong>{{ stats.lines }}</strong> 行</span>
      <span class="divider">|</span>
      <span class="stat-item"><strong>{{ stats.characters }}</strong> 字符</span>
      <span class="divider">|</span>
      <span class="stat-item"><strong>{{ stats.keywords }}</strong> 关键字</span>
      <span class="stat-note">仅本地处理，不执行 SQL</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { globalToast } from '../../composables/useToast.js'

const sampleSql = `SELECT u.id, u.username, u.email, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active' AND o.created_at >= '2026-01-01'
GROUP BY u.id, u.username, u.email
HAVING COUNT(o.id) > 0
ORDER BY order_count DESC
LIMIT 50;`

const input = ref(sampleSql)
const copied = ref(false)

const keywords = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|ALL|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|AS|DISTINCT|CASE|WHEN|THEN|ELSE|END)\b/gi
const clauseBreaks = /\s+(?=(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|VALUES|SET)\b)/gi

const stats = computed(() => ({
  lines: input.value ? input.value.split('\n').length : 0,
  characters: input.value.length,
  keywords: (input.value.match(keywords) || []).length
}))

function protectStrings(sql) {
  const strings = []
  const protectedSql = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`/g, value => {
    strings.push(value)
    return `__SQL_STRING_${strings.length - 1}__`
  })
  return { protectedSql, strings }
}

function restoreStrings(sql, strings) {
  return sql.replace(/__SQL_STRING_(\d+)__/g, (_, index) => strings[Number(index)])
}

function formatSql() {
  const source = input.value.trim()
  if (!source) return
  const { protectedSql, strings } = protectStrings(source)
  let formatted = protectedSql
    .replace(/\s+/g, ' ')
    .replace(clauseBreaks, '\n')
    .replace(/\s*,\s*/g, ',\n  ')
    .replace(/\s+AND\s+/gi, '\n  AND ')
    .replace(/\s+OR\s+/gi, '\n  OR ')
    .replace(/\s+((?:LEFT|RIGHT|INNER|OUTER|FULL|CROSS)\s+)?JOIN\s+/gi, (_, prefix = '') => `\n${prefix}JOIN `)
    .replace(/\s+ON\s+/gi, '\n  ON ')
    .replace(/\s+VALUES\s*/gi, '\nVALUES ')
    .replace(/\s+SET\s+/gi, '\nSET ')
    .replace(/\s*;\s*/g, ';\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()

  input.value = restoreStrings(formatted, strings)
  globalToast('SQL 已格式化')
}

function minifySql() {
  const source = input.value.trim()
  if (!source) return
  const { protectedSql, strings } = protectStrings(source)
  const minified = protectedSql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;])\s*/g, '$1')
    .trim()
  input.value = restoreStrings(minified, strings)
  globalToast('SQL 已压缩')
}

function loadSample() {
  input.value = sampleSql
  globalToast('SQL 示例已加载')
}

function copySql() {
  if (!input.value) return
  navigator.clipboard.writeText(input.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
  globalToast('SQL 已复制到剪贴板')
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
.stats-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1.25rem;
  color: var(--text-sub);
  font-size: 0.75rem;
  font-family: var(--font-mono);
}
.stat-item strong {
  color: var(--accent-cyan);
}
.divider {
  opacity: 0.4;
}
.stat-note {
  margin-left: auto;
  color: var(--accent-green);
}
@media (max-width: 768px) {
  .stats-bar {
    flex-wrap: wrap;
  }
  .stat-note {
    width: 100%;
    margin-left: 0;
  }
}
</style>