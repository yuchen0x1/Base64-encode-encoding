<template>
  <div class="tool-content">
    <!-- 赛博强密码生成器 -->
    <div class="glass-panel generator-card">
      <div class="card-header-bar">
        <div class="title-left">
          <span class="hud-marker">KEY-GEN</span>
          <h3 class="card-title">赛博强密码发生器 (ENTROPY GENERATOR)</h3>
        </div>
        <span class="badge-neon">CSPRNG 安全熵源</span>
      </div>

      <div class="options-row">
        <div class="slider-box">
          <div class="slider-label-row">
            <span class="param-name">熵池长度 (LENGTH):</span>
            <span class="param-val code-font text-cyan">{{ passwordLength }} BITS</span>
          </div>
          <input type="range" min="8" max="64" v-model.number="passwordLength" class="cyber-range" />
        </div>

        <div class="charset-grid">
          <label class="cyber-check"><input type="checkbox" v-model="includeUpper" /> <span>大写 [A-Z]</span></label>
          <label class="cyber-check"><input type="checkbox" v-model="includeLower" /> <span>小写 [a-z]</span></label>
          <label class="cyber-check"><input type="checkbox" v-model="includeNumbers" /> <span>数字 [0-9]</span></label>
          <label class="cyber-check"><input type="checkbox" v-model="includeSymbols" /> <span>符号 [!@#$%]</span></label>
        </div>
      </div>

      <div class="result-action-row">
        <div class="password-box">
          <input readonly type="text" :value="generatedPassword" class="input-control code-font password-display" />
        </div>
        <button class="btn btn-primary" @click="generatePassword">🎲 重新生成</button>
        <button class="btn btn-secondary" @click="copy(generatedPassword)">📋 一键复制</button>
      </div>
    </div>

    <!-- UUID / GUID 矩阵生成 -->
    <div class="glass-panel generator-card">
      <div class="card-header-bar">
        <div class="title-left">
          <span class="hud-marker purple">UUID-V4</span>
          <h3 class="card-title">全局唯一标识符 (UUID / GUID MATRIX)</h3>
        </div>
      </div>

      <div class="options-row">
        <label class="param-item">
          <span class="param-name">批量配额:</span>
          <select v-model="uuidCount" class="select-cyber code-font">
            <option :value="1">1 个实体</option>
            <option :value="5">5 个实体</option>
            <option :value="10">10 个实体</option>
          </select>
        </label>
        <label class="cyber-check"><input type="checkbox" v-model="uuidUppercase" /> <span>大写模式 (UPPER)</span></label>
        <label class="cyber-check"><input type="checkbox" v-model="uuidNoHyphens" /> <span>移除连字符 (NO HYPHEN)</span></label>
      </div>

      <div class="uuid-terminal code-font">
        <div v-for="(id, idx) in generatedUuids" :key="idx" class="uuid-line">
          <span class="uuid-idx text-cyan">[{{ String(idx + 1).padStart(2, '0') }}]</span>
          <span class="uuid-text">{{ id }}</span>
          <button class="btn btn-secondary btn-sm" @click="copy(id)">复制</button>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="generateUuids">🔄 刷新批次标识</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { globalToast } from '../../composables/useToast.js'

const passwordLength = ref(20)
const includeUpper = ref(true)
const includeLower = ref(true)
const includeNumbers = ref(true)
const includeSymbols = ref(true)
const generatedPassword = ref('')

const uuidCount = ref(5)
const uuidUppercase = ref(false)
const uuidNoHyphens = ref(false)
const generatedUuids = ref([])

function generatePassword() {
  let chars = ''
  if (includeUpper.value) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (includeLower.value) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (includeNumbers.value) chars += '0123456789'
  if (includeSymbols.value) chars += '!@#$%^&*()_+~`|}{[]:;?><,./-='
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz0123456789'

  let res = ''
  const array = new Uint32Array(passwordLength.value)
  window.crypto.getRandomValues(array)
  for (let i = 0; i < passwordLength.value; i++) {
    res += chars[array[i] % chars.length]
  }
  generatedPassword.value = res
}

function generateUuids() {
  const list = []
  for (let i = 0; i < uuidCount.value; i++) {
    let id = crypto.randomUUID()
    if (uuidNoHyphens.value) id = id.replace(/-/g, '')
    if (uuidUppercase.value) id = id.toUpperCase()
    list.push(id)
  }
  generatedUuids.value = list
}

watch([uuidCount, uuidUppercase, uuidNoHyphens], () => {
  generateUuids()
})

watch([passwordLength, includeUpper, includeLower, includeNumbers, includeSymbols], () => {
  generatePassword()
})

function copy(text) {
  navigator.clipboard.writeText(text)
  globalToast('已复制到剪贴板')
}

onMounted(() => {
  generatePassword()
  generateUuids()
})
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.generator-card {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.card-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0.85rem;
}
.title-left {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.hud-marker {
  font-size: 0.625rem;
  font-family: var(--font-mono);
  font-weight: 800;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.hud-marker.purple {
  background: rgba(192, 132, 252, 0.15);
  color: var(--accent-purple);
  border-color: rgba(192, 132, 252, 0.3);
}
.card-title {
  font-size: 1rem;
  font-weight: 700;
}
.options-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.5rem;
}
.slider-box {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 220px;
}
.slider-label-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
}
.cyber-range {
  accent-color: var(--accent-cyan);
  cursor: pointer;
}
.charset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}
.cyber-check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.825rem;
  color: var(--text-muted);
  cursor: pointer;
}
.result-action-row {
  display: flex;
  gap: 0.75rem;
}
.password-box {
  flex: 1;
}
.password-display {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--accent-cyan);
  text-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
  padding: 0.75rem 1rem;
  background: rgba(3, 7, 18, 0.6);
}
.uuid-terminal {
  background: rgba(3, 7, 18, 0.5);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  padding: 0.85rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.uuid-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.9rem;
}
.uuid-idx {
  font-size: 0.75rem;
  margin-right: 0.5rem;
}
.uuid-text {
  flex: 1;
  letter-spacing: 0.05em;
}
.select-cyber {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.35rem 0.65rem;
  border-radius: 0.4rem;
}
.text-cyan {
  color: var(--accent-cyan);
}
</style>
