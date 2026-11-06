<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="algo-selectors">
        <button 
          v-for="a in algorithms" 
          :key="a.id"
          :class="['tab-pill', selectedAlgo === a.id ? 'active' : '']"
          @click="selectedAlgo = a.id"
        >
          {{ a.name }}
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
          <span class="panel-title">{{ mode === 'encode' ? '明文输入缓冲区' : selectedAlgoName + ' 密文' }}</span>
          <span class="stat-badge code-font">{{ input.length }} CHARS</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control code-font"
          :placeholder="mode === 'encode' ? '输入要进行转换的原始文本...' : '输入待解码的密文字符串...'"
        ></textarea>
      </div>

      <!-- 输出区域 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">{{ mode === 'encode' ? selectedAlgoName + ' 结果' : '解码还原明文' }}</span>
          <div class="panel-actions">
            <span v-if="error" class="error-badge">⚠️ {{ error }}</span>
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

const algorithms = [
  { id: 'hex', name: 'Hex (十六进制)' },
  { id: 'morse', name: '摩斯密码 (Morse)' },
  { id: 'base32', name: 'Base32' },
  { id: 'rot13', name: 'ROT13 凯撒移位' }
]

const selectedAlgo = ref('hex')
const mode = ref('encode')
const input = ref('CYBER_SECURITY_2026')
const copied = ref(false)
const error = ref('')

const selectedAlgoName = computed(() => {
  const a = algorithms.find(item => item.id === selectedAlgo.value)
  return a ? a.name : '密文'
})

// Hex
function strToHex(str) {
  const bytes = new TextEncoder().encode(str)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')
}
function hexToStr(hex) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) throw new Error('无效的 Hex 长度')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

// Morse Code
const morseAlphabet = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..',
  '9': '----.', '0': '-----', ' ': '/'
}
const morseReverse = Object.fromEntries(Object.entries(morseAlphabet).map(([k, v]) => [v, k]))

function strToMorse(str) {
  return str.toUpperCase().split('').map(c => morseAlphabet[c] || c).join(' ')
}
function morseToStr(morse) {
  return morse.trim().split(/\s+/).map(m => morseReverse[m] || m).join('')
}

// Base32 (RFC 4648)
const b32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function strToBase32(str) {
  const bytes = new TextEncoder().encode(str)
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]
    bits += 8
    while (bits >= 5) {
      output += b32Alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += b32Alphabet[(value << (5 - bits)) & 31]
  }
  while (output.length % 8 !== 0) output += '='
  return output
}
function base32ToStr(b32) {
  const clean = b32.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (let i = 0; i < clean.length; i++) {
    const idx = b32Alphabet.indexOf(clean[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

// ROT13
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, function(c) {
    return String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)
  })
}

const output = computed(() => {
  error.value = ''
  if (!input.value) return ''
  try {
    const algo = selectedAlgo.value
    if (algo === 'hex') {
      return mode.value === 'encode' ? strToHex(input.value) : hexToStr(input.value)
    } else if (algo === 'morse') {
      return mode.value === 'encode' ? strToMorse(input.value) : morseToStr(input.value)
    } else if (algo === 'base32') {
      return mode.value === 'encode' ? strToBase32(input.value) : base32ToStr(input.value)
    } else if (algo === 'rot13') {
      return rot13(input.value)
    }
    return ''
  } catch (e) {
    error.value = e.message || '解码格式无效'
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
.algo-selectors, .mode-toggles {
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
}
.tab-pill.active {
  background: var(--bg-card);
  color: var(--accent-cyan);
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
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
.error-badge {
  font-size: 0.75rem;
  color: var(--accent-red);
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
