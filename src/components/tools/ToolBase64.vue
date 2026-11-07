<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="mode-toggles">
        <button 
          :class="['tab-pill', mode === 'encode' ? 'active' : '']"
          @click="mode = 'encode'"
        >
          <span class="pill-dot"></span>
          <span>编码 (ENCODE)</span>
        </button>
        <button 
          :class="['tab-pill', mode === 'decode' ? 'active' : '']"
          @click="mode = 'decode'"
        >
          <span class="pill-dot"></span>
          <span>解码 (DECODE)</span>
        </button>
      </div>

      <div class="options-group">
        <label class="cyber-checkbox">
          <input type="checkbox" v-model="urlSafe" />
          <span class="check-box-custom"></span>
          <span>URL-Safe 协议 (-_ 替换 +/)</span>
        </label>
      </div>

      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="pasteInput">📋 剪贴板读取</button>
        <button class="btn btn-secondary btn-sm" @click="input = ''">🗑️ 清空</button>
        <button class="btn btn-secondary btn-sm" @click="swapInputOutput">🔄 倒换</button>
      </div>
    </div>

    <!-- 双栏工作台 -->
    <div class="workbench-grid">
      <!-- 输入区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="hud-marker">IN</span>
            <span class="panel-title">
              {{ mode === 'encode' ? '明文输入缓冲区 (UTF-8)' : 'BASE64 输入缓冲区' }}
            </span>
          </div>
          <span class="stat-badge code-font">{{ input.length }} BYTES</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          :placeholder="mode === 'encode' ? '输入或粘贴需要进行 Base64 编码的文本...' : '输入或粘贴 Base64 密文字符串...'"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- 输出区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <div class="panel-title-wrap">
            <span class="hud-marker out">OUT</span>
            <span class="panel-title">
              {{ mode === 'encode' ? 'BASE64 矩阵输出' : '解码还原明文' }}
            </span>
          </div>
          <div class="panel-actions">
            <span v-if="error" class="error-badge">⚠️ {{ error }}</span>
            <span v-else class="stat-badge code-font text-cyan">{{ output.length }} BYTES</span>
            <button class="btn btn-primary btn-sm" @click="copyOutput" :disabled="!output">
              {{ copied ? '已复制 ✔' : '一键复制' }}
            </button>
          </div>
        </div>
        <textarea
          v-model="output"
          readonly
          class="textarea-control code-font output-textarea"
          placeholder="运算结果实时生成于此..."
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <!-- 底部状态小贴士 -->
    <div class="glass-panel tool-tips">
      <div class="tip-content">
        <span class="tip-badge">ENGINE INFO</span>
        <span>完整 UTF-8 支持与分块流式编码，超大文本无栈溢出；开启 URL-Safe 后兼容 RFC 4648 规范，避免网络 URL 传参被截断。</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { globalToast } from '../../composables/useToast.js'

const mode = ref('encode')
const input = ref('你好，极客工具箱！Hello, World! 🚀')
const urlSafe = ref(false)
const copied = ref(false)
const error = ref('')

function utf8ToBase64(str) {
  try {
    const bytes = new TextEncoder().encode(str)
    let binary = ''
    const len = bytes.byteLength
    const chunkSize = 8192
    for (let i = 0; i < len; i += chunkSize) {
      const sub = bytes.subarray(i, Math.min(i + chunkSize, len))
      binary += String.fromCharCode.apply(null, sub)
    }
    let b64 = window.btoa(binary)
    if (urlSafe.value) {
      b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }
    return b64
  } catch (e) {
    return ''
  }
}

function base64ToUtf8(str) {
  let clean = str.trim()
  if (!clean) return ''
  try {
    if (urlSafe.value || clean.includes('-') || clean.includes('_')) {
      clean = clean.replace(/-/g, '+').replace(/_/g, '/')
      while (clean.length % 4) {
        clean += '='
      }
    }
    const binary = window.atob(clean)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch (e) {
    throw new Error('无效的 Base64 格式或编码损坏')
  }
}

const output = computed(() => {
  error.value = ''
  if (!input.value) return ''
  try {
    if (mode.value === 'encode') {
      return utf8ToBase64(input.value)
    } else {
      return base64ToUtf8(input.value)
    }
  } catch (e) {
    error.value = e.message || '解码错误'
    return ''
  }
})

async function pasteInput() {
  try {
    const text = await navigator.clipboard.readText()
    input.value = text
  } catch {
    globalToast('无法读取剪贴板，请手动使用 Ctrl+V 粘贴', 'error')
  }
}

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
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
}
.tab-pill.active .pill-dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}
.options-group {
  display: flex;
  align-items: center;
  font-size: 0.85rem;
}
.cyber-checkbox {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.825rem;
}
.actions {
  display: flex;
  gap: 0.5rem;
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
.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.hud-marker {
  font-size: 0.625rem;
  font-family: var(--font-mono);
  font-weight: 800;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.hud-marker.out {
  background: rgba(192, 132, 252, 0.15);
  color: var(--accent-purple);
  border-color: rgba(192, 132, 252, 0.3);
}
.panel-title {
  font-size: 0.85rem;
  font-weight: 700;
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
  background: rgba(56, 189, 248, 0.15);
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
}
</style>
