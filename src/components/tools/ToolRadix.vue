<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="toolbar-left">
        <span class="hud-tag">BASE CONVERTER</span>
        <span class="toolbar-title">矩阵四进制互换：输入任意一栏，全链路微秒级联动计算</span>
      </div>
      <button class="btn btn-secondary btn-sm" @click="resetValues">🗑️ 归零清空</button>
    </div>

    <!-- 异常状态反馈 -->
    <div v-if="error" class="cyber-alert">
      <span class="alert-icon">⚠️</span>
      <span>{{ error }}</span>
    </div>

    <div class="radix-grid">
      <!-- 2 进制 -->
      <div class="glass-panel radix-hud-card">
        <div class="radix-header">
          <div class="radix-meta">
            <span class="radix-chip chip-cyan">BIN</span>
            <span class="radix-name">二进制 (Base 2)</span>
          </div>
          <button class="btn btn-secondary btn-sm" @click="copy(binVal)">📋 复制</button>
        </div>
        <div class="input-wrap">
          <input
            v-model="binVal"
            @input="onBinChange"
            type="text"
            class="input-control code-font radix-input text-cyan"
            placeholder="01010101..."
          />
        </div>
        <div class="radix-footer">
          <span>位宽: {{ binVal ? binVal.length : 0 }} bits</span>
        </div>
      </div>

      <!-- 8 进制 -->
      <div class="glass-panel radix-hud-card">
        <div class="radix-header">
          <div class="radix-meta">
            <span class="radix-chip chip-green">OCT</span>
            <span class="radix-name">八进制 (Base 8)</span>
          </div>
          <button class="btn btn-secondary btn-sm" @click="copy(octVal)">📋 复制</button>
        </div>
        <div class="input-wrap">
          <input
            v-model="octVal"
            @input="onOctChange"
            type="text"
            class="input-control code-font radix-input text-green"
            placeholder="0-7..."
          />
        </div>
        <div class="radix-footer">
          <span>有效字符: 0 ~ 7</span>
        </div>
      </div>

      <!-- 10 进制 (焦点高亮) -->
      <div class="glass-panel radix-hud-card highlight-dec">
        <div class="radix-header">
          <div class="radix-meta">
            <span class="radix-chip chip-dec">DEC</span>
            <span class="radix-name">十进制 (Base 10 · 主视口)</span>
          </div>
          <button class="btn btn-primary btn-sm" @click="copy(decVal)">📋 复制</button>
        </div>
        <div class="input-wrap">
          <input
            v-model="decVal"
            @input="onDecChange"
            type="text"
            class="input-control code-font radix-input text-amber"
            placeholder="0-9..."
          />
        </div>
        <div class="radix-footer">
          <span>支持标准整数与任意精度 BigInt</span>
        </div>
      </div>

      <!-- 16 进制 -->
      <div class="glass-panel radix-hud-card">
        <div class="radix-header">
          <div class="radix-meta">
            <span class="radix-chip chip-purple">HEX</span>
            <span class="radix-name">十六进制 (Base 16)</span>
          </div>
          <button class="btn btn-secondary btn-sm" @click="copy(hexVal)">📋 复制</button>
        </div>
        <div class="input-wrap">
          <input
            v-model="hexVal"
            @input="onHexChange"
            type="text"
            class="input-control code-font radix-input text-purple"
            placeholder="0-9, A-F..."
          />
        </div>
        <div class="radix-footer">
          <span>字节跨度: {{ Math.ceil((hexVal ? hexVal.length : 0) / 2) }} Bytes</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { globalToast } from '../../composables/useToast.js'
import { formatRadixValue, parseRadixValue } from '../../utils/toolHelpers.js'

const binVal = ref('11010110')
const octVal = ref('326')
const decVal = ref('214')
const hexVal = ref('D6')
const error = ref('')

function syncFromBigInt(val, exclude) {
  error.value = ''
  if (val === null || val === undefined) {
    if (exclude !== 'bin') binVal.value = ''
    if (exclude !== 'oct') octVal.value = ''
    if (exclude !== 'dec') decVal.value = ''
    if (exclude !== 'hex') hexVal.value = ''
    return
  }
  if (exclude !== 'bin') binVal.value = formatRadixValue(val, 2)
  if (exclude !== 'oct') octVal.value = formatRadixValue(val, 8)
  if (exclude !== 'dec') decVal.value = formatRadixValue(val, 10)
  if (exclude !== 'hex') hexVal.value = formatRadixValue(val, 16)
}

function onBinChange() {
  const clean = binVal.value.trim()
  if (!clean) return syncFromBigInt(null, 'bin')
  if (!/^-?[01]+$/.test(clean)) {
    error.value = '二进制只允许输入 0 或 1，可使用前导负号'
    return
  }
  try {
    const val = parseRadixValue(clean, 2)
    syncFromBigInt(val, 'bin')
  } catch {
    error.value = '数值过大或格式无效'
  }
}

function onOctChange() {
  const clean = octVal.value.trim()
  if (!clean) return syncFromBigInt(null, 'oct')
  if (!/^-?[0-7]+$/.test(clean)) {
    error.value = '八进制只允许输入 0 到 7，可使用前导负号'
    return
  }
  try {
    const val = parseRadixValue(clean, 8)
    syncFromBigInt(val, 'oct')
  } catch {
    error.value = '数值过大或格式无效'
  }
}

function onDecChange() {
  const clean = decVal.value.trim()
  if (!clean) return syncFromBigInt(null, 'dec')
  if (!/^-?[0-9]+$/.test(clean)) {
    error.value = '十进制只允许输入数字和前导负号'
    return
  }
  try {
    const val = parseRadixValue(clean, 10)
    syncFromBigInt(val, 'dec')
  } catch {
    error.value = '数值过大或格式无效'
  }
}

function onHexChange() {
  const clean = hexVal.value.trim()
  if (!clean) return syncFromBigInt(null, 'hex')
  if (!/^-?[0-9a-fA-F]+$/.test(clean)) {
    error.value = '十六进制只允许输入 0-9、A-F 和前导负号'
    return
  }
  try {
    const val = parseRadixValue(clean, 16)
    syncFromBigInt(val, 'hex')
  } catch {
    error.value = '数值过大或格式无效'
  }
}

function resetValues() {
  binVal.value = ''
  octVal.value = ''
  decVal.value = ''
  hexVal.value = ''
  error.value = ''
}

function copy(text) {
  if (!text) return
  navigator.clipboard.writeText(text)
  globalToast('已复制：' + text)
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
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  border-radius: 0.65rem;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.hud-tag {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.15);
  border: 1px solid rgba(var(--rgb-primary), 0.3);
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}
.toolbar-title {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.cyber-alert {
  padding: 0.65rem 1rem;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--accent-red);
  border-radius: 0.5rem;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.radix-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}
@media (max-width: 640px) {
  .radix-grid {
    grid-template-columns: 1fr;
  }
}
.radix-hud-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  position: relative;
  overflow: hidden;
  border-radius: 0.65rem;
}
.highlight-dec {
  border-color: rgba(var(--rgb-primary), 0.4);
  box-shadow: 0 0 20px rgba(var(--rgb-primary), 0.15);
}
.radix-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.radix-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.radix-chip {
  font-size: 0.675rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}
.chip-cyan {
  background: rgba(var(--rgb-cyan), 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(var(--rgb-cyan), 0.3);
}
.chip-green {
  background: rgba(var(--rgb-green), 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(var(--rgb-green), 0.3);
}
.chip-dec {
  background: rgba(var(--rgb-amber), 0.15);
  color: var(--accent-amber);
  border: 1px solid rgba(var(--rgb-amber), 0.3);
}
.chip-purple {
  background: rgba(var(--rgb-purple), 0.15);
  color: var(--accent-purple);
  border: 1px solid rgba(var(--rgb-purple), 0.3);
}
.radix-name {
  font-size: 0.9rem;
  font-weight: 700;
}
.radix-input {
  font-size: 1.2rem;
  font-weight: 700;
  padding: 0.85rem 1rem;
}
.text-cyan {
  color: var(--accent-cyan);
  text-shadow: 0 0 10px rgba(var(--rgb-cyan), 0.3);
}
.text-green {
  color: var(--accent-green);
  text-shadow: 0 0 10px rgba(var(--rgb-green), 0.3);
}
.text-amber {
  color: var(--accent-amber);
  text-shadow: 0 0 10px rgba(var(--rgb-amber), 0.3);
}
.text-purple {
  color: var(--accent-purple);
  text-shadow: 0 0 10px rgba(var(--rgb-purple), 0.3);
}
.radix-footer {
  font-size: 0.725rem;
  color: var(--text-sub);
  font-family: var(--font-mono);
}
</style>
