<template>
  <div class="tool-content">
    <div class="tool-toolbar">
      <div class="options">
        <label class="param-item">
          <span>尺寸 (px):</span>
          <select v-model="size" class="select-control">
            <option :value="180">小 (180x180)</option>
            <option :value="256">中 (256x256)</option>
            <option :value="360">大 (360x360)</option>
          </select>
        </label>
        <label class="param-item">
          <span>容错率:</span>
          <select v-model="errorCorrectionLevel" class="select-control">
            <option value="L">L (7% 低容错)</option>
            <option value="M">M (15% 标准)</option>
            <option value="Q">Q (25% 较高)</option>
            <option value="H">H (30% 最高)</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="downloadQr" :disabled="!qrDataUrl">
          💾 保存下载 PNG
        </button>
      </div>
    </div>

    <div class="workbench-grid">
      <!-- 输入区域 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">二维码内容 (网址 / 文本 / 名片)</span>
          <span class="stat-badge">{{ input.length }} 字符</span>
        </div>
        <textarea
          v-model="input"
          class="textarea-control"
          placeholder="请输入需要生成二维码的网址或文本内容..."
        ></textarea>
      </div>

      <!-- 输出区域：二维码预览 -->
      <div class="panel qr-preview-panel">
        <div class="panel-header">
          <span class="panel-title">二维码实时预览</span>
        </div>
        <div class="qr-canvas-wrapper">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" class="qr-image" />
          <div v-else class="placeholder-tip">输入内容后即可生成二维码</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import QRCode from 'qrcode'
import { createQrDataUrl } from '../../utils/toolHelpers.js'

const input = ref('https://www.toolhelper.cn/')
const size = ref(256)
const errorCorrectionLevel = ref('M')
const qrDataUrl = ref('')

let generation = 0

async function generateQr() {
  const currentGeneration = ++generation
  qrDataUrl.value = ''
  const options = {
    width: size.value,
    margin: 2,
    errorCorrectionLevel: errorCorrectionLevel.value,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  }
  const dataUrl = await createQrDataUrl(
    input.value,
    options,
    (text, qrOptions) => QRCode.toDataURL(text, qrOptions),
    (error) => console.error(error)
  )
  if (currentGeneration === generation) qrDataUrl.value = dataUrl
}

watch([input, size, errorCorrectionLevel], () => {
  generateQr()
})

function downloadQr() {
  if (!qrDataUrl.value) return
  const a = document.createElement('a')
  a.href = qrDataUrl.value
  a.download = `qrcode_${Date.now()}.png`
  a.click()
}

onMounted(() => {
  generateQr()
})
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.tool-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
}
.options {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.param-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.select-control {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.35rem 0.6rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  outline: none;
}
.workbench-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 768px) {
  .workbench-grid {
    grid-template-columns: 1fr;
  }
}
.panel {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  background: var(--bg-input);
  border-bottom: 1px solid var(--border-color);
}
.panel-title {
  font-size: 0.85rem;
  font-weight: 600;
}
.stat-badge {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.textarea-control {
  flex: 1;
  border: none;
  border-radius: 0;
  padding: 1rem;
  min-height: 280px;
}
.qr-preview-panel {
  align-items: center;
}
.qr-canvas-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--bg-card);
}
.qr-image {
  border-radius: 0.5rem;
  box-shadow: var(--shadow-md);
  background: #ffffff;
  padding: 0.5rem;
}
.placeholder-tip {
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
