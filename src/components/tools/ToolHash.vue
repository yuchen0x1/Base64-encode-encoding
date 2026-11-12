<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="actions">
        <label class="param-item">
          <span class="param-label">散列模式:</span>
          <select v-model="selectedAlgorithm" class="select-cyber">
            <option value="MD5">MD5 (128-bit 经典摘要)</option>
            <option value="SHA1">SHA-1 (160-bit)</option>
            <option value="SHA256">SHA-256 (256-bit 工业级安全)</option>
            <option value="SHA512">SHA-512 (512-bit 高强度哈希)</option>
            <option value="HMAC-SHA256">HMAC-SHA256 (密钥签名认证)</option>
          </select>
        </label>
        <label class="param-item">
          <span class="param-label">大小写:</span>
          <select v-model="letterCase" class="select-cyber">
            <option value="lower">小写 (abcdef)</option>
            <option value="upper">大写 (ABCDEF)</option>
          </select>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空缓冲</button>
      </div>
    </div>

    <!-- HMAC 密钥配置 -->
    <div v-if="selectedAlgorithm.startsWith('HMAC')" class="glass-panel secret-box">
      <span class="secret-label">HMAC SECRET KEY:</span>
      <input v-model="secretKey" type="text" class="input-control code-font" placeholder="输入签名私钥..." />
    </div>

    <div class="workbench-grid">
      <!-- 输入区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">明文载荷数据 (PAYLOAD)</span>
          <span class="stat-badge code-font">{{ input.length }} CHARS</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          placeholder="输入需要生成哈希指纹的明文数据..."
        ></textarea>
      </div>

      <!-- 输出区域：选中算法的主结果与完整摘要矩阵 -->
      <div class="glass-panel panel hash-results">
        <div class="panel-header">
          <span class="panel-title">主结果 · {{ primaryHash.name }}</span>
          <span class="badge-neon">{{ selectedAlgorithm }}</span>
        </div>
        <div class="primary-result">
          <div class="hash-meta">
            <span class="algo-name code-font">当前选中算法</span>
            <button class="btn btn-secondary btn-sm" :disabled="!primaryHash.val" @click="copy(primaryHash.val)">📋 复制主结果</button>
          </div>
          <div class="primary-result-value code-font">{{ primaryHash.val || '（等待输入数据流）' }}</div>
        </div>
        <div class="matrix-header">
          <span class="panel-title">全部摘要矩阵 (HASH MATRIX)</span>
          <span class="matrix-hint">选中行与主结果一致</span>
        </div>
        <div class="hashes-list">
          <div
            v-for="res in calculatedHashes"
            :key="res.id"
            class="hash-row"
            :class="{ 'is-selected': res.id === primaryHash.id }"
            :aria-current="res.id === primaryHash.id ? 'true' : undefined"
          >
            <div class="hash-meta">
              <span class="algo-name code-font">{{ res.name }}</span>
              <span v-if="res.id === primaryHash.id" class="selected-tag">主结果</span>
              <button class="btn btn-secondary btn-sm" :disabled="!res.val" @click="copy(res.val)">📋 复制</button>
            </div>
            <div class="hash-val code-font">{{ res.val || (input ? '仅选择 HMAC-SHA256 时计算' : '（等待输入数据流）') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { calculateHashResults } from './hashHelpers.js'
import { globalToast } from '../../composables/useToast.js'

const input = ref('admin123456')
const selectedAlgorithm = ref('MD5')
const letterCase = ref('lower')
const secretKey = ref('my_secret_key')

const hashResults = computed(() => calculateHashResults({
  input: input.value,
  algorithm: selectedAlgorithm.value,
  letterCase: letterCase.value,
  secretKey: secretKey.value
}))
const calculatedHashes = computed(() => hashResults.value.hashes)
const primaryHash = computed(() => hashResults.value.primary)

function copy(text) {
  if (!text) return
  navigator.clipboard.writeText(text)
  globalToast('已复制指纹到剪贴板')
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
.param-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.param-label {
  color: var(--text-sub);
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
.secret-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1.25rem;
}
.secret-label {
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  font-weight: 700;
}
.secret-box .input-control {
  flex: 1;
  min-width: 0;
}
.workbench-grid {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 1.25rem;
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
  resize: vertical;
  min-height: 280px;
}
.hash-results {
  min-width: 0;
}
.primary-result {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(var(--rgb-primary), 0.06);
}
.primary-result-value {
  min-height: 2.6rem;
  display: flex;
  align-items: center;
  overflow-wrap: anywhere;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.025em;
  color: var(--text-main);
  background: var(--surface-well);
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(var(--rgb-primary), 0.35);
  border-radius: 4px;
  user-select: all;
}
.matrix-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem 0;
}
.matrix-hint {
  font-size: 0.72rem;
  color: var(--text-sub);
}
.hashes-list {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  overflow-y: auto;
  max-height: 500px;
}
.hash-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.65rem 0.85rem;
  background: var(--surface-inset-2);
  border-radius: 0.45rem;
  border: 1px solid rgba(var(--rgb-primary), 0.15);
  transition: all 0.2s ease;
}
.hash-row:hover {
  border-color: rgba(var(--rgb-primary), 0.4);
  box-shadow: 0 0 15px rgba(var(--rgb-primary), 0.1);
}
.hash-row.is-selected {
  border-color: rgba(var(--rgb-primary), 0.75);
  box-shadow: inset 3px 0 0 var(--accent-cyan), 0 0 14px rgba(var(--rgb-primary), 0.12);
}
.hash-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.hash-meta .algo-name {
  margin-right: auto;
}
.selected-tag {
  flex: none;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.12);
}
.algo-name {
  font-size: 0.775rem;
  font-weight: 700;
  color: var(--accent-cyan);
}
.hash-val {
  font-size: 0.85rem;
  word-break: break-all;
  user-select: all;
  color: var(--text-main);
  background: var(--surface-well);
  padding: 0.35rem 0.55rem;
  border-radius: 4px;
}
</style>
