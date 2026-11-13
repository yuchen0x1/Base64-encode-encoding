<template>
  <div class="tool-content">
    <div class="glass-panel color-preview-wrap" :style="{ background: bgStyle }">
      <div class="preview-inner">
        <span class="preview-label">色彩实时预览</span>
        <span class="preview-hex code-font">{{ hexValue }}</span>
      </div>
    </div>

    <div class="color-input-row">
      <div class="glass-panel panel input-card">
        <div class="panel-header">
          <span class="panel-title">取色器 / 输入色值</span>
        </div>
        <div class="input-body">
          <input v-model="hexValue" type="color" class="color-picker" :style="{ borderColor: currentRgba }" />
          <input v-model="hexValue" type="text" class="input-control code-font" spellcheck="false" placeholder="#RRGGBB 或 #RGB" />
          <div class="swatches">
            <button
              v-for="c in swatches"
              :key="c"
              class="swatch"
              :style="{ background: c }"
              @click="hexValue = c"
              :title="c"
            ></button>
          </div>
        </div>
      </div>

      <!-- 各格式输出 -->
      <div class="glass-panel panel output-card">
        <div class="panel-header">
          <span class="panel-title">颜色格式互转</span>
          <span v-if="error" class="error-badge">⚠️ {{ error }}</span>
        </div>
        <div class="formats-list">
          <div v-for="f in formats" :key="f.label" class="format-row">
            <span class="format-label code-font">{{ f.label }}</span>
            <span class="format-val code-font">{{ f.value }}</span>
            <button class="btn btn-secondary btn-sm" @click="copy(f.value)">📋 复制</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { copyText } from '../../utils/clipboard.js'
import { ref, computed } from 'vue'
import { globalToast } from '../../composables/useToast.js'

const hexValue = ref('#38bdf8')
const error = ref('')
const swatches = ['#38bdf8', '#34d399', '#c084fc', '#f472b6', '#fb7185', '#fbbf24', '#0f172a', '#f8fafc']

function hexToRgb(hex) {
  let h = hex.replace(/^#/, '').trim()
  if (!h) return null
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  const int = parseInt(h, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255
  }
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

const rgb = computed(() => {
  error.value = ''
  const val = hexToRgb(hexValue.value)
  if (!val) {
    error.value = '无效的 HEX 色值'
    return { r: 0, g: 0, b: 0 }
  }
  return val
})

const currentRgba = computed(() => {
  const c = rgb.value
  return `rgba(${c.r}, ${c.g}, ${c.b}, 1)`
})

const bgStyle = computed(() => {
  return `linear-gradient(135deg, ${hexValue.value} 0%, rgba(255,255,255,0.2) 200%)`
})

const hsl = computed(() => {
  const c = rgb.value
  return rgbToHsl(c.r, c.g, c.b)
})

const normalizedHex = computed(() => {
  const c = rgb.value
  return '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')
})

const formats = computed(() => {
  const c = rgb.value
  const h = hsl.value
  return [
    { label: 'HEX', value: normalizedHex.value },
    { label: 'RGB', value: `rgb(${c.r}, ${c.g}, ${c.b})` },
    { label: 'RGBA', value: `rgba(${c.r}, ${c.g}, ${c.b}, 1)` },
    { label: 'HSL', value: `hsl(${h.h}, ${h.s}%, ${h.l}%)` },
    { label: 'HSLA', value: `hsla(${h.h}, ${h.s}%, ${h.l}%, 1)` },
    { label: 'CSS var', value: `--color: ${normalizedHex.value};` }
  ]
})

async function copy(text) {
  if (!text) return
  if (!await copyText(text)) return
  globalToast('已复制：' + text)
}
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
}
.color-preview-wrap {
  border-radius: 0.75rem;
  min-height: 140px;
  display: flex;
  align-items: flex-end;
  padding: 1.25rem;
  border: 1px solid var(--border-color);
}
.preview-inner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.preview-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}
.preview-hex {
  font-size: 0.9rem;
  font-weight: 800;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  backdrop-filter: blur(4px);
}
.color-input-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 1.25rem;
}
@media (max-width: 768px) {
  .color-input-row {
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
.error-badge {
  font-size: 0.75rem;
  color: var(--accent-red);
}
.input-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.color-picker {
  width: 100%;
  height: 48px;
  border: 2px solid var(--border-color);
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
}
.swatches {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.swatch {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: transform 0.15s ease;
}
.swatch:hover {
  transform: scale(1.15);
}
.formats-list {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.format-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.85rem;
  background: var(--surface-inset);
  border: 1px solid rgba(var(--rgb-primary), 0.15);
  border-radius: 0.45rem;
}
.format-label {
  font-size: 0.775rem;
  font-weight: 700;
  color: var(--accent-cyan);
  width: 80px;
  flex-shrink: 0;
}
.format-val {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-main);
  user-select: all;
}
</style>