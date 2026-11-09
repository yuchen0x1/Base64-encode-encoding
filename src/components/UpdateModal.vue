<template>
  <Teleport to="body">
    <Transition name="upd-fade">
      <div v-if="state.open" class="upd-backdrop" @click.self="closeUpdatePanel">
        <div class="upd-card" role="dialog" aria-modal="true" aria-label="版本更新">
          <header class="upd-header">
            <div class="upd-title-wrap">
              <span class="upd-icon"><RefreshCw :size="18" /></span>
              <div>
                <h3 class="upd-title">版本更新</h3>
                <p class="upd-sub">{{ modeLabel }} · 当前 v{{ state.currentVersion }}</p>
              </div>
            </div>
            <button class="upd-close" title="关闭" @click="closeUpdatePanel">
              <X :size="18" />
            </button>
          </header>

          <div class="upd-body">
            <div class="upd-version-row">
              <div class="ver-box">
                <span class="ver-label">当前版本</span>
                <strong class="ver-value">v{{ state.currentVersion }}</strong>
              </div>
              <ArrowRight :size="18" class="ver-arrow" />
              <div :class="['ver-box', state.latest ? 'highlight' : '']">
                <span class="ver-label">最新版本</span>
                <strong class="ver-value">{{ state.latest ? `v${state.latest.version}` : '待检测' }}</strong>
              </div>
            </div>

            <div :class="['upd-status', `is-${state.status}`]">
              <component :is="statusIcon" :size="16" :class="['status-icon', isBusy ? 'spin' : '']" />
              <span>{{ statusText }}</span>
              <span v-if="state.latest?.sizeText" class="pkg-size">{{ state.latest.sizeText }}</span>
            </div>

            <div v-if="isBusy" class="upd-progress">
              <div class="bar-track">
                <span class="bar-fill" :style="{ width: `${Math.max(2, state.progress)}%` }"></span>
              </div>
              <div class="bar-meta">
                <span>{{ state.message || '处理中…' }}</span>
                <span class="code-font">{{ state.progress }}%</span>
              </div>
            </div>

            <div v-if="state.latest?.notes?.length" class="upd-notes-block">
              <div class="notes-title">
                <Sparkles :size="14" class="text-cyan" />
                <span>本次更新内容</span>
              </div>
              <ul class="upd-notes">
                <li v-for="(note, index) in state.latest.notes" :key="index">
                  <CheckCircle2 :size="13" class="note-dot" />
                  <span>{{ note }}</span>
                </li>
              </ul>
            </div>

            <p v-if="state.status === 'error'" class="upd-error">
              <AlertTriangle :size="14" />
              <span>{{ state.error }}</span>
            </p>

            <p class="upd-hint">{{ modeHint }}</p>
          </div>

          <footer class="upd-footer">
            <span class="upd-meta-text">{{ lastCheckedText }}</span>
            <div class="upd-actions">
              <button class="btn btn-secondary btn-sm" @click="closeUpdatePanel">
                {{ isBusy ? '后台继续' : '关闭' }}
              </button>
              <button
                class="btn btn-primary btn-sm"
                :disabled="isBusy"
                @click="primaryAction"
              >
                <RefreshCw v-if="state.status === 'available' || state.status === 'ready'" :size="14" />
                <Download v-else-if="state.status === 'idle' || state.status === 'uptodate' || state.status === 'error'" :size="14" />
                <Loader2 v-else :size="14" class="spin" />
                <span>{{ primaryLabel }}</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import {
  RefreshCw,
  X,
  ArrowRight,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Server,
  Monitor,
  Globe
} from 'lucide-vue-next'
import {
  useUpdater,
  closeUpdatePanel,
  checkForUpdates,
  downloadUpdate,
  installUpdate
} from '../composables/useUpdater.js'

const { state, modeLabel, primaryLabel } = useUpdater()

const isBusy = computed(() => ['checking', 'downloading', 'restarting'].includes(state.status))

const statusIcon = computed(() => {
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'restarting') return Loader2
  if (state.status === 'available') return Download
  if (state.status === 'error') return AlertTriangle
  if (state.mode === 'electron') return Monitor
  if (state.mode === 'server') return Server
  if (state.mode === 'static') return Globe
  return CheckCircle2
})

const statusText = computed(() => {
  switch (state.status) {
    case 'idle': return '点击「立即检查」获取最新版本信息'
    case 'checking': return '正在连接更新服务器…'
    case 'uptodate': return `已是最新版本 v${state.currentVersion}`
    case 'available': return `发现新版本 v${state.latest?.version || ''}，可立即更新`
    case 'downloading': return state.message || '正在下载更新包…'
    case 'ready': return state.message || '更新包已就绪'
    case 'restarting': return state.message || '正在重启…'
    case 'error': return state.error || '更新失败'
    default: return ''
  }
})

const modeHint = computed(() => {
  if (state.mode === 'electron' && state.portable) return '当前是便携版：可以检查和下载更新，但无法安全替换正在运行的临时目录。请安装新版 NSIS 安装包，安装后会创建桌面和开始菜单快捷方式。'
  if (state.mode === 'electron') return '桌面安装版：下载完成后将自动替换程序文件并重启，新版本窗口会自动打开。'
  if (state.mode === 'server') return '网页版（本地更新服务）：将自动下载更新包、校验 SHA-256、替换文件并重启服务器，页面随后自动刷新。'
  if (state.mode === 'static') return '网页版（静态部署）：新版本文件已发布在服务器上，点击更新将清理缓存并刷新加载。'
  return '正在检测运行环境…'
})

const lastCheckedText = computed(() => {
  if (!state.lastCheckedAt) return ''
  const d = new Date(state.lastCheckedAt)
  const pad = (n) => String(n).padStart(2, '0')
  return `上次检查 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

async function primaryAction() {
  if (isBusy.value) return
  try {
    if (state.status === 'available') {
      await downloadUpdate()
    } else if (state.status === 'ready') {
      if (state.portable) {
        state.error = '便携版无法自动安装更新，请下载并安装新版 NSIS 安装包。'
        return
      }
      await installUpdate()
    } else {
      await checkForUpdates({ manual: true })
    }
  } catch {
    /* 错误已写入 state.error，由弹窗展示 */
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && state.open) closeUpdatePanel()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style>
.upd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgba(2, 6, 23, 0.62);
  backdrop-filter: blur(6px);
}

.upd-card {
  width: min(560px, 100%);
  max-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  background: var(--bg-card-hover, #fff);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.upd-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem 1.25rem 0.9rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-subtle);
}

.upd-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.upd-icon {
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

.upd-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-main);
}

.upd-sub {
  margin: 0.15rem 0 0;
  font-size: 0.72rem;
  color: var(--text-sub);
}

.upd-close {
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

.upd-close:hover {
  color: var(--accent-red);
  border-color: rgba(var(--rgb-red), 0.35);
  background: rgba(var(--rgb-red), 0.08);
}

.upd-body {
  padding: 1.1rem 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.upd-version-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0.6rem;
}

.ver-box {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.6rem;
  border: 1px dashed var(--border-color);
  background: var(--surface-inset);
}

.ver-box.highlight {
  border-style: solid;
  border-color: rgba(var(--rgb-cyan), 0.45);
  background: rgba(var(--rgb-cyan), 0.1);
}

.ver-label {
  font-size: 0.68rem;
  color: var(--text-sub);
  letter-spacing: 0.04em;
}

.ver-value {
  font-size: 1.02rem;
  font-weight: 800;
  color: var(--text-main);
  font-family: var(--font-mono);
}

.ver-box.highlight .ver-value {
  color: var(--accent-cyan);
}

.ver-arrow {
  color: var(--text-sub);
}

.upd-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 0.55rem;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--surface-inset);
  border: 1px solid var(--border-color);
}

.upd-status.is-available {
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-cyan), 0.35);
  background: rgba(var(--rgb-cyan), 0.09);
}

.upd-status.is-uptodate {
  color: var(--accent-green);
  border-color: rgba(var(--rgb-green), 0.35);
  background: rgba(var(--rgb-green), 0.09);
}

.upd-status.is-error {
  color: var(--accent-red);
  border-color: rgba(var(--rgb-red), 0.4);
  background: rgba(var(--rgb-red), 0.09);
}

.status-icon {
  flex-shrink: 0;
}

.pkg-size {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-sub);
  font-family: var(--font-mono);
}

.upd-progress {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.bar-track {
  height: 7px;
  border-radius: 999px;
  background: var(--surface-inset-2);
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent-cyan), var(--primary));
  transition: width 0.3s ease;
}

.bar-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-sub);
}

.upd-notes-block {
  border: 1px solid var(--border-color);
  border-radius: 0.65rem;
  background: var(--surface-well);
  padding: 0.75rem 0.85rem;
}

.notes-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 0.5rem;
}

.upd-notes {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.upd-notes li {
  display: flex;
  gap: 0.45rem;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-muted);
}

.note-dot {
  margin-top: 0.18rem;
  flex-shrink: 0;
  color: var(--accent-green);
}

.upd-error {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 0.55rem;
  font-size: 0.78rem;
  color: var(--accent-red);
  background: rgba(var(--rgb-red), 0.08);
  border: 1px solid rgba(var(--rgb-red), 0.3);
}

.upd-hint {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.6;
  color: var(--text-sub);
}

.upd-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--border-color);
  background: var(--bg-subtle);
}

.upd-meta-text {
  font-size: 0.7rem;
  color: var(--text-sub);
  font-family: var(--font-mono);
}

.upd-actions {
  display: flex;
  gap: 0.5rem;
}

.spin {
  animation: upd-spin 0.9s linear infinite;
}

@keyframes upd-spin {
  to { transform: rotate(360deg); }
}

.upd-fade-enter-active,
.upd-fade-leave-active {
  transition: opacity 0.2s ease;
}

.upd-fade-enter-from,
.upd-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .upd-version-row {
    grid-template-columns: 1fr;
  }
  .ver-arrow {
    transform: rotate(90deg);
    justify-self: center;
  }
  .upd-footer {
    flex-direction: column;
    align-items: stretch;
  }
  .upd-actions {
    justify-content: flex-end;
  }
}
</style>
