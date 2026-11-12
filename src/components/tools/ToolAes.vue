<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="mode-toggles">
        <button
          :class="['tab-pill', mode === 'encrypt' ? 'active' : '']"
          @click="mode = 'encrypt'"
        >
          <span class="pill-dot"></span>
          <span>加密 (ENCRYPT)</span>
        </button>
        <button
          :class="['tab-pill', mode === 'decrypt' ? 'active' : '']"
          @click="mode = 'decrypt'"
        >
          <span class="pill-dot"></span>
          <span>解密 (DECRYPT)</span>
        </button>
      </div>

      <div class="actions">
        <label class="param-item">
          <span class="param-label">模式:</span>
          <select v-model="modeOpt" class="select-cyber">
            <option value="CBC">CBC (推荐)</option>
            <option value="ECB">ECB</option>
            <option value="CFB">CFB</option>
          </select>
        </label>
        <label class="param-item">
          <span class="param-label">填充:</span>
          <select v-model="padding" class="select-cyber">
            <option value="Pkcs7">PKCS7</option>
            <option value="ZeroPadding">ZeroPadding</option>
            <option value="NoPadding">NoPadding</option>
          </select>
        </label>
        <label class="param-item">
          <span class="param-label">输出:</span>
          <select v-model="outputEncoding" class="select-cyber">
            <option value="Base64">Base64</option>
            <option value="Hex">Hex</option>
          </select>
        </label>
      </div>
    </div>

    <!-- 密钥配置区 -->
    <div class="glass-panel key-config">
      <label class="param-item">
        <span class="param-label">密钥 KEY:</span>
        <input v-model="secretKey" type="text" class="input-control code-font" placeholder="输入 16/24/32 字节密钥..." />
      </label>
      <label v-if="modeOpt !== 'ECB'" class="param-item">
        <span class="param-label">偏移 IV:</span>
        <input v-model="iv" type="text" class="input-control code-font" placeholder="输入 16 字节初始向量..." />
      </label>
    </div>

    <div class="workbench-grid">
      <!-- 输入区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'encrypt' ? '明文输入 (PLAINTEXT)' : '密文输入 (CIPHERTEXT)' }}</span>
          <span class="stat-badge code-font">{{ input.length }} CHARS</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          :placeholder="mode === 'encrypt' ? '输入要加密的明文内容...' : '输入要解密的密文内容...'"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- 输出区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'encrypt' ? '密文输出 (CIPHERTEXT)' : '明文还原 (PLAINTEXT)' }}</span>
          <div class="panel-actions">
            <span v-if="error" class="error-badge">⚠️ {{ error }}</span>
            <button class="btn btn-primary btn-sm" @click="copyOutput" :disabled="!output">
              {{ copied ? '已复制 ✔' : '一键复制' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="output"
          readonly
          class="textarea-control code-font output-textarea"
          :placeholder="mode === 'encrypt' ? '加密结果实时生成于此...' : '解密结果实时生成于此...'"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <div class="glass-panel tool-tips">
      <div class="tip-content">
        <span class="tip-badge">SECURITY NOTE</span>
        <span>AES 为标准对称加密，加密与解密需使用相同密钥；ECB 模式无需 IV。密文以 {{ outputEncoding }} 编码输出。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import CryptoJS from 'crypto-js'
import { parseCiphertext, validateAesParameters } from './aesTool.js'

const mode = ref('encrypt')
const modeOpt = ref('CBC')
const padding = ref('Pkcs7')
const outputEncoding = ref('Base64')
const secretKey = ref('0123456789abcdef')
const iv = ref('0123456789abcdef')
const input = ref('')
const copied = ref(false)
const error = ref('')

function buildCipher(text, isEncrypt) {
  if (!text) return ''

  const validation = validateAesParameters({
    key: secretKey.value,
    iv: iv.value,
    mode: modeOpt.value
  })
  if (!validation.valid) throw new Error(validation.error)

  const cfg = { mode: CryptoJS.mode[modeOpt.value], padding: CryptoJS.pad[padding.value] }
  if (modeOpt.value !== 'ECB') cfg.iv = CryptoJS.enc.Utf8.parse(iv.value)
  const key = CryptoJS.enc.Utf8.parse(secretKey.value)

  if (isEncrypt) {
    const encrypted = CryptoJS.AES.encrypt(text, key, cfg)
    return outputEncoding.value === 'Hex' ? encrypted.ciphertext.toString(CryptoJS.enc.Hex) : encrypted.toString()
  }

  const ciphertext = parseCiphertext(text, outputEncoding.value, modeOpt.value)
  const params = outputEncoding.value === 'Hex'
    ? CryptoJS.enc.Hex.parse(ciphertext)
    : CryptoJS.enc.Base64.parse(ciphertext)
  const decrypted = CryptoJS.AES.decrypt({ ciphertext: params }, key, cfg)
  try {
    return decrypted.toString(CryptoJS.enc.Utf8)
  } catch {
    throw new Error('无法解密：密钥、模式、IV 或填充不匹配')
  }
}

const output = computed(() => {
  error.value = ''
  if (!input.value) return ''
  try {
    return buildCipher(input.value, mode.value === 'encrypt')
  } catch (e) {
    error.value = e.message || '加解密失败'
    return ''
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
.key-config {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
}
.key-config .param-item {
  flex: 1;
  min-width: 240px;
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
.error-badge {
  font-size: 0.75rem;
  color: var(--accent-red);
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