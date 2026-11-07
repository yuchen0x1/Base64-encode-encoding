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

      <!-- 输出区域：矩阵终端 -->
      <div class="glass-panel panel hash-results">
        <div class="panel-header">
          <span class="panel-title">散列指纹矩阵 (HASH MATRIX)</span>
          <span class="badge-neon">REAL-TIME</span>
        </div>
        <div class="hashes-list">
          <div v-for="res in calculatedHashes" :key="res.name" class="hash-row">
            <div class="hash-meta">
              <span class="algo-name code-font">{{ res.name }}</span>
              <button class="btn btn-secondary btn-sm" @click="copy(res.val)">📋 复制</button>
            </div>
            <div class="hash-val code-font">{{ res.val || '（等待输入数据流）' }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import CryptoJS from 'crypto-js'
import { globalToast } from '../../composables/useToast.js'

const input = ref('admin123456')
const selectedAlgorithm = ref('MD5')
const letterCase = ref('lower')
const secretKey = ref('my_secret_key')

function formatCase(str) {
  return letterCase.value === 'upper' ? str.toUpperCase() : str.toLowerCase()
}

const calculatedHashes = computed(() => {
  if (!input.value) {
    return [
      { name: 'MD5 (16-BIT)', val: '' },
      { name: 'MD5 (32-BIT)', val: '' },
      { name: 'SHA-1 (40-BIT)', val: '' },
      { name: 'SHA-256 (64-BIT)', val: '' },
      { name: 'SHA-512 (128-BIT)', val: '' },
      { name: 'HMAC-SHA256', val: '' }
    ]
  }

  try {
    const md5 = formatCase(CryptoJS.MD5(input.value).toString())
    const sha1 = formatCase(CryptoJS.SHA1(input.value).toString())
    const sha256 = formatCase(CryptoJS.SHA256(input.value).toString())
    const sha512 = formatCase(CryptoJS.SHA512(input.value).toString())
    const hmacSha256 = formatCase(CryptoJS.HmacSHA256(input.value, secretKey.value || '').toString())

    return [
      { name: 'MD5 (16位中截取)', val: md5.substring(8, 24) },
      { name: 'MD5 (32位完整摘要)', val: md5 },
      { name: 'SHA-1 (40位安全指纹)', val: sha1 },
      { name: 'SHA-256 (64位密码级)', val: sha256 },
      { name: 'SHA-512 (128位超强摘要)', val: sha512 },
      { name: 'HMAC-SHA256 (密钥签名)', val: hmacSha256 }
    ]
  } catch (e) {
    return []
  }
})

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
  background: rgba(3, 7, 18, 0.4);
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
  background: rgba(3, 7, 18, 0.5);
  border-radius: 0.45rem;
  border: 1px solid rgba(56, 189, 248, 0.15);
  transition: all 0.2s ease;
}
.hash-row:hover {
  border-color: rgba(56, 189, 248, 0.4);
  box-shadow: 0 0 15px rgba(56, 189, 248, 0.1);
}
.hash-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  background: rgba(0, 0, 0, 0.2);
  padding: 0.35rem 0.55rem;
  border-radius: 4px;
}
</style>
