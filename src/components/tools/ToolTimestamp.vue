<template>
  <div class="tool-content">
    <!-- 顶部全息时钟面板 -->
    <div class="glass-panel hologram-clock-card">
      <div class="clock-ambient-light"></div>
      <div class="clock-left">
        <div class="time-header-tag">
          <span class="live-dot"></span>
          <span class="tag-txt">BEIJING STANDARD TIME (UTC+8)</span>
        </div>
        <div class="big-digital-time code-font">
          <span class="time-glow">{{ currentDateTimeStr }}</span>
        </div>
      </div>
      <div class="clock-right">
        <div class="stamp-chip-group">
          <div class="stamp-chip">
            <span class="chip-label">UNIX 10-DIGIT (SEC)</span>
            <span class="chip-val code-font text-cyan">{{ nowSeconds }}</span>
          </div>
          <div class="stamp-chip">
            <span class="chip-label">EPOCH 13-DIGIT (MS)</span>
            <span class="chip-val code-font text-purple">{{ nowMillis }}</span>
          </div>
        </div>
        <div class="clock-controls">
          <button class="btn btn-secondary btn-sm" @click="isPaused = !isPaused">
            {{ isPaused ? '▶ 恢复同步' : '⏸ 冻结当前时间' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 时间戳 -> 日期时间 转换控制台 -->
    <div class="glass-panel convert-terminal">
      <div class="terminal-bar">
        <div class="bar-title">
          <span class="terminal-prompt">#</span>
          <span>时间戳 转 可读日期时间 (TIMESTAMP ➔ DATETIME)</span>
        </div>
      </div>
      <div class="terminal-body">
        <div class="inline-form">
          <div class="input-glow-wrapper">
            <input 
              v-model="inputTimestamp" 
              type="text" 
              class="input-control code-font" 
              placeholder="输入 10 位(秒) 或 13 位(毫秒) 时间戳..."
            />
          </div>
          <select v-model="stampUnit" class="select-cyber code-font">
            <option value="s">秒级 (10位)</option>
            <option value="ms">毫秒 (13位)</option>
          </select>
          <button class="btn btn-secondary btn-sm" @click="fillCurrentStamp">⚡ 注入当前</button>
          <button class="btn btn-primary btn-sm" @click="convertStampToDate">解析转换 ➔</button>
        </div>
        <div v-if="outputDateResult" class="cyber-result-box code-font">
          <span class="result-label">解析输出:</span>
          <strong class="result-value text-green">{{ outputDateResult }}</strong>
        </div>
      </div>
    </div>

    <!-- 日期时间 -> 时间戳 转换控制台 -->
    <div class="glass-panel convert-terminal">
      <div class="terminal-bar">
        <div class="bar-title">
          <span class="terminal-prompt">#</span>
          <span>标准日期时间 转 Unix 时间戳 (DATETIME ➔ TIMESTAMP)</span>
        </div>
      </div>
      <div class="terminal-body">
        <div class="inline-form">
          <div class="input-glow-wrapper">
            <input 
              v-model="inputDatetime" 
              type="text" 
              class="input-control code-font" 
              placeholder="格式: YYYY-MM-DD HH:mm:ss (例: 2026-11-05 14:30:00)"
            />
          </div>
          <button class="btn btn-secondary btn-sm" @click="fillCurrentDatetime">⚡ 填入此刻</button>
          <button class="btn btn-primary btn-sm" @click="convertDateToStamp">生成时间戳 ➔</button>
        </div>
        <div v-if="outputStampSeconds" class="cyber-result-dual code-font">
          <div class="dual-row">
            <span class="row-tag">秒 (10位):</span>
            <span class="row-num text-cyan">{{ outputStampSeconds }}</span>
            <button class="btn btn-secondary btn-sm" @click="copy(outputStampSeconds)">📋 复制</button>
          </div>
          <div class="dual-row">
            <span class="row-tag">毫秒 (13位):</span>
            <span class="row-num text-purple">{{ outputStampMillis }}</span>
            <button class="btn btn-secondary btn-sm" @click="copy(outputStampMillis)">📋 复制</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const currentDateTimeStr = ref('')
const nowSeconds = ref(0)
const nowMillis = ref(0)
const isPaused = ref(false)

const inputTimestamp = ref('')
const stampUnit = ref('s')
const outputDateResult = ref('')

const inputDatetime = ref('')
const outputStampSeconds = ref('')
const outputStampMillis = ref('')

let timer = null

function updateClock() {
  if (isPaused.value) return
  const now = new Date()
  currentDateTimeStr.value = formatDate(now)
  nowMillis.value = now.getTime()
  nowSeconds.value = Math.floor(now.getTime() / 1000)
}

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function fillCurrentStamp() {
  inputTimestamp.value = stampUnit.value === 's' ? String(nowSeconds.value) : String(nowMillis.value)
  convertStampToDate()
}

function convertStampToDate() {
  if (!inputTimestamp.value.trim()) return
  let val = parseInt(inputTimestamp.value.trim(), 10)
  if (isNaN(val)) {
    outputDateResult.value = '无效的时间戳格式'
    return
  }
  if (stampUnit.value === 's' || String(val).length <= 10) {
    val = val * 1000
  }
  const d = new Date(val)
  outputDateResult.value = formatDate(d)
}

function fillCurrentDatetime() {
  inputDatetime.value = currentDateTimeStr.value
  convertDateToStamp()
}

function convertDateToStamp() {
  if (!inputDatetime.value.trim()) return
  const parsed = Date.parse(inputDatetime.value.trim().replace(/-/g, '/'))
  if (isNaN(parsed)) {
    outputStampSeconds.value = '格式解析错误'
    outputStampMillis.value = '格式解析错误'
    return
  }
  outputStampSeconds.value = String(Math.floor(parsed / 1000))
  outputStampMillis.value = String(parsed)
}

function copy(text) {
  navigator.clipboard.writeText(text)
  alert('已复制：' + text)
}

onMounted(() => {
  updateClock()
  inputTimestamp.value = String(nowSeconds.value)
  convertStampToDate()
  inputDatetime.value = currentDateTimeStr.value
  convertDateToStamp()
  timer = setInterval(updateClock, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.hologram-clock-card {
  position: relative;
  overflow: hidden;
  padding: 1.5rem 1.75rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(3, 7, 18, 0.9) 100%);
  border: 1px solid rgba(56, 189, 248, 0.25);
  box-shadow: 0 0 25px rgba(56, 189, 248, 0.1);
}
.clock-ambient-light {
  position: absolute;
  top: -50px;
  right: -50px;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.25) 0%, transparent 70%);
  pointer-events: none;
}
.time-header-tag {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
}
.tag-txt {
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  font-family: var(--font-mono);
  color: var(--text-sub);
}
.big-digital-time {
  font-size: 2.1rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: 0.02em;
}
.time-glow {
  text-shadow: 0 0 15px rgba(56, 189, 248, 0.5);
}
.clock-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
}
.stamp-chip-group {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.stamp-chip {
  display: flex;
  flex-direction: column;
  padding: 0.4rem 0.85rem;
  background: rgba(3, 7, 18, 0.6);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 0.45rem;
}
.chip-label {
  font-size: 0.625rem;
  color: var(--text-sub);
  font-family: var(--font-mono);
}
.chip-val {
  font-size: 1.05rem;
  font-weight: 700;
}
.text-cyan {
  color: var(--accent-cyan);
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.3);
}
.text-purple {
  color: var(--accent-purple);
  text-shadow: 0 0 10px rgba(192, 132, 252, 0.3);
}
.text-green {
  color: var(--accent-green);
  text-shadow: 0 0 10px rgba(52, 211, 153, 0.3);
}

.convert-terminal {
  overflow: hidden;
}
.terminal-bar {
  padding: 0.65rem 1.25rem;
  background: rgba(3, 7, 18, 0.4);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.825rem;
  font-weight: 700;
  display: flex;
  align-items: center;
}
.terminal-prompt {
  color: var(--accent-cyan);
  margin-right: 0.5rem;
  font-family: var(--font-mono);
}
.terminal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.inline-form {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.input-glow-wrapper {
  flex: 1;
  min-width: 250px;
}
.select-cyber {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.5rem 0.85rem;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  outline: none;
}
.cyber-result-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.15rem;
  background: rgba(3, 7, 18, 0.5);
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 0.5rem;
  box-shadow: 0 0 15px rgba(52, 211, 153, 0.1);
}
.cyber-result-dual {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem 1.15rem;
  background: rgba(3, 7, 18, 0.5);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 0.5rem;
}
.dual-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.95rem;
}
.row-tag {
  color: var(--text-sub);
  font-size: 0.825rem;
}
.row-num {
  font-weight: 700;
}
</style>
