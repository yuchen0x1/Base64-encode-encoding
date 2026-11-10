<template>
  <Teleport to="body">
    <Transition name="fb-fade">
      <div v-if="open" class="fb-backdrop" @click.self="close">
        <div class="fb-card" role="dialog" aria-modal="true" aria-labelledby="fb-title">
          <header class="fb-header">
            <div class="fb-title-wrap">
              <span class="fb-icon"><MessageCircle :size="18" /></span>
              <div>
                <h3 id="fb-title" class="fb-title">反馈 &amp; 交流群</h3>
                <p class="fb-sub">功能建议、缺陷反馈与版本更新，都在这一个群里</p>
              </div>
            </div>
            <button class="fb-close" title="关闭" @click="close">
              <X :size="18" />
            </button>
          </header>

          <div class="fb-body">
            <!-- 群名片 -->
            <div class="fb-group-card">
              <div class="fb-avatar" aria-hidden="true">QQ</div>
              <div class="fb-group-info">
                <h4 class="fb-group-name">{{ QQ_GROUP.name }}</h4>
                <p class="fb-group-desc">官方交流群 · 加群后可直接 @ 作者反馈问题</p>
                <div class="fb-tags">
                  <span v-for="tag in QQ_GROUP.purposes" :key="tag" class="fb-tag">{{ tag }}</span>
                </div>
              </div>
            </div>

            <!-- 二维码 + 说明 -->
            <div class="fb-qr-row">
              <div class="fb-qr-box">
                <img v-if="qrDataUrl" :src="qrDataUrl" alt="QQ 群二维码" class="fb-qr-img" />
                <span v-else class="fb-qr-loading">二维码生成中…</span>
              </div>
              <div class="fb-qr-side">
                <p class="fb-qr-title">
                  <QrCode :size="14" class="text-cyan" />
                  <span>手机 QQ 扫码直接入群</span>
                </p>
                <ul class="fb-points">
                  <li>桌面端点击「一键加入」将调用系统浏览器打开加群页</li>
                  <li>移动端可复制链接，在 QQ 内粘贴打开</li>
                  <li>群链接：<span class="fb-link code-font">{{ QQ_GROUP.displayUrl }}</span></li>
                </ul>
              </div>
            </div>

            <p class="fb-tip">
              <Info :size="14" />
              <span>{{ QQ_GROUP.tip }}</span>
            </p>

            <p v-if="nativeHint" class="fb-native">
              <Smartphone :size="14" />
              <span>当前为移动端容器：请使用上方二维码或复制群链接，在 QQ 客户端内打开加入。</span>
            </p>
          </div>

          <footer class="fb-footer">
            <div class="fb-actions">
              <button class="btn btn-secondary btn-sm" @click="copyLink">
                <Check v-if="copied" :size="14" class="text-cyan" />
                <Copy v-else :size="14" />
                <span>{{ copied ? '已复制' : '复制群链接' }}</span>
              </button>
              <a
                class="btn btn-secondary btn-sm"
                :href="ISSUE_URL"
                target="_blank"
                rel="noopener noreferrer"
                title="在 GitHub 提交 Issue"
              >
                <Bug :size="14" />
                <span>提交 Issue</span>
              </a>
              <button class="btn btn-primary btn-sm" @click="joinGroup">
                <UserPlus :size="14" />
                <span>一键加入 QQ 群</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import {
  MessageCircle,
  X,
  QrCode,
  Copy,
  Check,
  Bug,
  Info,
  UserPlus,
  Smartphone
} from 'lucide-vue-next'
import QRCode from 'qrcode'
import {
  QQ_GROUP,
  ISSUE_URL,
  openExternalLink,
  copyToClipboard,
  isNativeContainer
} from '../config/social.js'
import { globalToast } from '../composables/useToast.js'

const props = defineProps({
  open: { type: Boolean, default: false }
})
const emit = defineEmits(['update:open', 'close'])

const qrDataUrl = ref('')
const copied = ref(false)
const nativeHint = ref(false)
let copyTimer = null

/** 生成群二维码（深色主题下也放在白底框内，保证可扫描） */
async function ensureQrCode() {
  if (qrDataUrl.value) return
  try {
    qrDataUrl.value = await QRCode.toDataURL(QQ_GROUP.url, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0b1220', light: '#ffffff' }
    })
  } catch {
    qrDataUrl.value = ''
  }
}

function close() {
  emit('update:open', false)
  emit('close')
}

function joinGroup() {
  const result = openExternalLink(QQ_GROUP.url)
  if (result === 'blocked') {
    // 原生容器 / 跳转被拦截：引导复制链接，避免 WebView 顶掉 App 页面
    nativeHint.value = true
    copyLink()
    return
  }
  if (result === 'fallback') {
    globalToast('已请求打开加群页；若被浏览器拦截，请点「复制群链接」在 QQ 内打开', 'success')
    return
  }
  globalToast('已在浏览器打开 QQ 加群页，请在 QQ 内确认入群', 'success')
}

async function copyLink() {
  const ok = await copyToClipboard(QQ_GROUP.url)
  copied.value = ok
  globalToast(ok ? '群链接已复制，可在 QQ 内粘贴打开' : '复制失败，请手动选择链接复制', ok ? 'success' : 'error')
  if (copyTimer) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copied.value = false }, 2200)
}

function onKeydown(event) {
  if (event.key === 'Escape' && props.open) close()
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      nativeHint.value = isNativeContainer()
      ensureQrCode()
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<style scoped>
.fb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(6px);
}

.fb-card {
  width: min(620px, 100%);
  max-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  background: var(--bg-card-hover);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.fb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 0.9rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-subtle);
}

.fb-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.fb-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.6rem;
  color: var(--accent-cyan);
  background: rgba(var(--rgb-cyan), 0.12);
  border: 1px solid rgba(var(--rgb-cyan), 0.3);
}

.fb-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
}

.fb-sub {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  color: var(--text-sub);
}

.fb-close {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.45rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.18s ease;
}

.fb-close:hover {
  color: var(--accent-red);
  border-color: rgba(var(--rgb-red), 0.35);
  background: rgba(var(--rgb-red), 0.08);
}

.fb-body {
  padding: 1.1rem 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.fb-group-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.7rem;
  border: 1px solid rgba(var(--rgb-cyan), 0.28);
  background: linear-gradient(135deg, rgba(var(--rgb-cyan), 0.1) 0%, rgba(var(--rgb-primary), 0.04) 100%);
}

.fb-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 0.65rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #ffffff;
  background: linear-gradient(135deg, #12b7f5 0%, #0e86d4 100%);
  box-shadow: 0 0 14px rgba(18, 183, 245, 0.35);
}

.fb-group-info {
  min-width: 0;
}

.fb-group-name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-main);
}

.fb-group-desc {
  margin: 0.15rem 0 0.45rem;
  font-size: 0.74rem;
  color: var(--text-muted);
}

.fb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.fb-tag {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  color: var(--accent-cyan);
  background: rgba(var(--rgb-cyan), 0.12);
  border: 1px solid rgba(var(--rgb-cyan), 0.28);
}

.fb-qr-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem;
  border-radius: 0.7rem;
  border: 1px dashed var(--border-color);
  background: var(--surface-inset);
}

.fb-qr-box {
  flex-shrink: 0;
  width: 148px;
  height: 148px;
  padding: 8px;
  border-radius: 0.55rem;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.fb-qr-img {
  width: 100%;
  height: 100%;
  display: block;
  image-rendering: pixelated;
}

.fb-qr-loading {
  font-size: 0.72rem;
  color: #64748b;
}

.fb-qr-side {
  min-width: 0;
}

.fb-qr-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0 0 0.45rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-main);
}

.fb-points {
  margin: 0;
  padding-left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.74rem;
  line-height: 1.55;
  color: var(--text-muted);
}

.fb-link {
  color: var(--accent-cyan);
  word-break: break-all;
}

.fb-tip,
.fb-native {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.73rem;
  line-height: 1.6;
  color: var(--text-sub);
}

.fb-native {
  color: var(--accent-amber);
}

.fb-tip svg,
.fb-native svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.fb-footer {
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-subtle);
}

.fb-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.fb-fade-enter-active,
.fb-fade-leave-active {
  transition: opacity 0.2s ease;
}

.fb-fade-enter-from,
.fb-fade-leave-to {
  opacity: 0;
}

@media (max-width: 560px) {
  .fb-qr-row {
    flex-direction: column;
    align-items: stretch;
    text-align: left;
  }
  .fb-qr-box {
    align-self: center;
  }
  .fb-actions {
    justify-content: stretch;
  }
  .fb-actions > * {
    flex: 1 1 auto;
  }
}
</style>
