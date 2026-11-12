<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="mode-toggles">
        <button 
          :class="['tab-pill', activeMode === 'img2base64' ? 'active' : '']"
          @click="activeMode = 'img2base64'"
        >
          🖼️ 图片转 Base64 DataURL
        </button>
        <button 
          :class="['tab-pill', activeMode === 'base642img' ? 'active' : '']"
          @click="activeMode = 'base642img'"
        >
          🔤 Base64 还原图片
        </button>
      </div>

      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="resetAll">🗑️ 清空</button>
      </div>
    </div>

    <!-- 模式 1: 图片 -> Base64 -->
    <div v-if="activeMode === 'img2base64'" class="workbench-grid">
      <!-- 拖拽上传区 -->
      <div class="glass-panel panel upload-panel" @dragover.prevent @drop.prevent="handleDrop">
        <div class="panel-header">
          <span class="panel-title">图片载入区 (拖拽或点击)</span>
          <span v-if="fileInfo" class="stat-badge code-font">{{ fileInfo.size }} KB · {{ fileInfo.type }}</span>
        </div>
        <div class="drop-zone" @click="triggerFileInput">
          <input type="file" ref="fileInput" @change="handleFileSelect" accept="image/*" style="display: none;" />
          <div v-if="!imagePreviewUrl" class="drop-hint">
            <span class="drop-icon">📤</span>
            <span class="drop-text">点击选择 或 将图片文件拖拽至此处</span>
            <span class="drop-sub">支持 PNG, JPG, WebP, GIF, SVG 等</span>
          </div>
          <div v-else class="preview-box">
            <img :src="imagePreviewUrl" alt="Preview" class="loaded-img" />
          </div>
        </div>
      </div>

      <!-- 输出 Base64 代码 -->
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">Base64 DataURL 输出</span>
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="copy(outputBase64)" :disabled="!outputBase64">
              {{ copied ? '已复制 ✔' : '📋 复制 DataURL' }}
            </button>
            <button class="btn btn-secondary btn-sm" @click="copyHtmlTag" :disabled="!outputBase64">
              复制 &lt;img&gt; 标签
            </button>
          </div>
        </div>
        <textarea
          v-model="outputBase64"
          readonly
          class="textarea-control code-font output-textarea"
          placeholder="上传图片后在此生成 data:image/...;base64 完整代码..."
        ></textarea>
      </div>
    </div>

    <!-- 模式 2: Base64 -> 图片 -->
    <div v-else class="workbench-grid">
      <div class="glass-panel panel">
        <div class="panel-header">
          <span class="panel-title">粘贴 Base64 代码</span>
          <span class="stat-badge code-font">{{ inputBase64.length }} CHARS</span>
        </div>
        <textarea
          v-model="inputBase64"
          class="textarea-control code-font"
          placeholder="在此粘贴 data:image/...;base64,... 字符串..."
        ></textarea>
      </div>

      <div class="glass-panel panel preview-panel">
        <div class="panel-header">
          <span class="panel-title">图片渲染预览</span>
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="downloadDecodedImage" :disabled="!isRenderable">
              💾 导出保存图片
            </button>
          </div>
        </div>
        <div class="render-canvas-box">
          <img v-if="isRenderable" :src="renderSrc" alt="Rendered" class="rendered-img" />
          <div v-else class="empty-tip">在左侧输入有效的图片 Base64 编码以渲染</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { globalToast } from '../../composables/useToast.js'
import { imageExtensionForMime, parseImageDataUrl } from '../../utils/toolHelpers.js'

const activeMode = ref('img2base64')
const fileInput = ref(null)
const imagePreviewUrl = ref('')
const outputBase64 = ref('')
const fileInfo = ref(null)
const copied = ref(false)

const inputBase64 = ref('')
let fileReadGeneration = 0

function clearImageState() {
  imagePreviewUrl.value = ''
  outputBase64.value = ''
  fileInfo.value = null
}

function triggerFileInput() {
  if (fileInput.value) fileInput.value.click()
}

function processFile(file) {
  const generation = ++fileReadGeneration
  clearImageState()

  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    if (generation !== fileReadGeneration) return
    const parsed = parseImageDataUrl(event.target?.result)
    if (!parsed) {
      clearImageState()
      globalToast('无法读取有效的图片数据，请选择有效的图片文件。', 'error')
      return
    }

    fileInfo.value = {
      name: file.name,
      size: (file.size / 1024).toFixed(2),
      type: parsed.mimeType
    }
    outputBase64.value = parsed.dataUrl
    imagePreviewUrl.value = parsed.dataUrl
  }
  reader.onerror = () => {
    if (generation !== fileReadGeneration) return
    clearImageState()
    globalToast('图片读取失败，请重试。', 'error')
  }
  reader.onabort = () => {
    if (generation !== fileReadGeneration) return
    clearImageState()
    globalToast('图片读取已取消。', 'error')
  }

  try {
    reader.readAsDataURL(file)
  } catch {
    if (generation === fileReadGeneration) {
      clearImageState()
      globalToast('图片读取失败，请重试。', 'error')
    }
  }
}

function handleFileSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  processFile(file)
}

function handleDrop(event) {
  const file = event.dataTransfer.files?.[0]
  if (file) processFile(file)
}

function copy(text) {
  if (!text) return
  navigator.clipboard.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function copyHtmlTag() {
  if (!outputBase64.value) return
  const tag = `<img src="${outputBase64.value}" alt="image" />`
  navigator.clipboard.writeText(tag)
  globalToast('已复制 <img> HTML 标签代码')
}

const parsedImage = computed(() => parseImageDataUrl(inputBase64.value))
const renderSrc = computed(() => parsedImage.value?.dataUrl || '')
const isRenderable = computed(() => Boolean(parsedImage.value))

function downloadDecodedImage() {
  const parsed = parsedImage.value
  if (!parsed) return
  const a = document.createElement('a')
  a.href = parsed.dataUrl
  a.download = `decoded_image_${Date.now()}.${imageExtensionForMime(parsed.mimeType)}`
  a.click()
}

function resetAll() {
  fileReadGeneration += 1
  clearImageState()
  if (fileInput.value) fileInput.value.value = ''
  inputBase64.value = ''
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
.mode-toggles {
  display: flex;
  background: var(--bg-input);
  padding: 0.25rem;
  border-radius: 0.5rem;
  gap: 0.25rem;
  border: 1px solid var(--border-color);
}
.tab-pill {
  padding: 0.4rem 0.95rem;
  font-size: 0.825rem;
  font-weight: 700;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}
.tab-pill.active {
  background: var(--bg-card);
  color: var(--accent-cyan);
  box-shadow: 0 0 12px rgba(var(--rgb-primary), 0.2);
}
.workbench-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  min-height: 420px;
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
  gap: 0.5rem;
}
.drop-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  cursor: pointer;
  transition: all 0.2s ease;
}
.drop-zone:hover {
  background: rgba(var(--rgb-primary), 0.05);
}
.drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}
.drop-icon {
  font-size: 2.5rem;
}
.drop-text {
  font-weight: 600;
  font-size: 0.95rem;
}
.drop-sub {
  font-size: 0.75rem;
  color: var(--text-sub);
}
.preview-box {
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
}
.loaded-img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 0.5rem;
  box-shadow: var(--shadow-md);
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
.render-canvas-box {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}
.rendered-img {
  max-width: 100%;
  max-height: 300px;
  border-radius: 0.5rem;
  box-shadow: var(--shadow-md);
  background: #fff;
}
.empty-tip {
  color: var(--text-sub);
  font-size: 0.85rem;
}
</style>
