<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="jwt-tags">
        <span class="hud-marker">JWT DECODER</span>
        <span
          :class="['status-chip', tokenStatus.notYetValid ? 'not-yet-valid' : (tokenStatus.valid ? (tokenStatus.expired ? 'expired' : 'active') : 'invalid')]"
          role="status"
        >
          {{ tokenStatus.text }}
        </span>
        <span :class="['signature-chip', signatureStatus.kind]" role="status">
          {{ signatureStatus.text }}
        </span>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" :disabled="loadingSample" @click="loadSample">
          {{ loadingSample ? '生成示例中…' : '📝 加载可验签示例' }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="clearAll">🗑️ 清空</button>
      </div>
    </div>

    <div class="glass-panel panel jwt-input-panel">
      <div class="panel-header">
        <span class="panel-title">编码凭证流 (ENCODED TOKEN)</span>
        <span class="stat-badge code-font">{{ rawJwt.length }} BYTES</span>
      </div>
      <textarea
        v-model="rawJwt"
        class="textarea-control code-font jwt-textarea"
        placeholder="在此粘贴 JWT Token (三段式结构: Header.Payload.Signature)..."
        spellcheck="false"
      ></textarea>
    </div>

    <div class="jwt-grid">
      <div class="glass-panel panel">
        <div class="panel-header header-red">
          <div class="panel-title-wrap">
            <span class="jwt-badge badge-red">HEADER</span>
            <span class="panel-title">算法与令牌类型</span>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="!parsedParts.valid" @click="copyPart(formattedHeader)">
            复制
          </button>
        </div>
        <textarea
          readonly
          class="textarea-control code-font output-part text-pink"
          :value="formattedHeader"
        ></textarea>
      </div>

      <div class="glass-panel panel">
        <div class="panel-header header-purple">
          <div class="panel-title-wrap">
            <span class="jwt-badge badge-purple">PAYLOAD</span>
            <span class="panel-title">数据载荷 (DATA CLAIMS)</span>
          </div>
          <button class="btn btn-secondary btn-sm" :disabled="!parsedParts.valid" @click="copyPart(formattedPayload)">
            复制
          </button>
        </div>
        <textarea
          readonly
          class="textarea-control code-font output-part text-purple"
          :value="formattedPayload"
        ></textarea>
      </div>
    </div>

    <div class="glass-panel verification-panel">
      <div class="verification-header">
        <div>
          <div class="verification-title-row">
            <span class="hud-marker">LOCAL SIGNATURE CHECK</span>
            <span class="verification-title">本地 HS256 验签</span>
          </div>
          <p class="verification-sub">密钥只保留在当前页面内存中，不写入工作区、localStorage 或更新日志。</p>
        </div>
        <div class="mode-switch" role="group" aria-label="JWT 验签模式">
          <button
            :class="['mode-btn', !verifyMode ? 'active' : '']"
            :aria-pressed="!verifyMode"
            @click="verifyMode = false"
          >
            仅解析
          </button>
          <button
            :class="['mode-btn', verifyMode ? 'active' : '']"
            :aria-pressed="verifyMode"
            @click="verifyMode = true"
          >
            HS256 验签
          </button>
        </div>
      </div>

      <div v-if="verifyMode" class="verification-body">
        <label class="secret-field">
          <span>HS256 密钥</span>
          <div class="secret-input-wrap">
            <input
              v-model="secret"
              :type="showSecret ? 'text' : 'password'"
              class="input-control code-font"
              autocomplete="off"
              spellcheck="false"
              placeholder="输入用于 HMAC-SHA-256 验证的密钥"
              aria-label="HS256 签名密钥"
            />
            <button type="button" class="btn btn-secondary btn-sm" @click="showSecret = !showSecret">
              {{ showSecret ? '隐藏' : '显示' }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="!secret" @click="secret = ''">
              清除密钥
            </button>
          </div>
        </label>
        <div :class="['verification-result', signatureStatus.kind]" role="status" aria-live="polite">
          <strong>{{ signatureStatus.text }}</strong>
          <span v-if="verification?.error">{{ verification.error }}</span>
          <span v-else-if="verification?.status === 'verified'">
            HMAC-SHA-256 与 Header.alg=HS256 匹配；签名通过不代表载荷内容可信，仍需校验业务声明与签发方。
          </span>
          <span v-else-if="!rawJwt.trim()">粘贴 Token 后开始验签。</span>
          <span v-else-if="verifying">正在本机计算签名…</span>
          <span v-else>输入密钥后可验证签名；算法不匹配时会明确拒绝。</span>
        </div>
        <div class="security-note">
          <span>⚠️ 解码成功不等于验签成功。本工具不支持 RS256/ES256，也不会将 Token 发送到网络。</span>
        </div>
      </div>
      <div v-else class="parse-only-note">
        当前为仅解析模式：只解码 Header/Payload 并检查时间声明，不验证签名真实性。
      </div>
    </div>

    <div v-if="claimsMeta.length > 0" class="glass-panel claims-hud">
      <div class="claims-header">
        <span class="hud-marker">TIMESTAMP AUDIT</span>
        <span class="claims-title">标准时效声明时间轴诊断</span>
      </div>
      <div class="claims-list">
        <div v-for="claim in claimsMeta" :key="claim.key" class="claim-item">
          <span class="claim-key code-font">{{ claim.key }} ({{ claim.name }})</span>
          <span class="claim-val code-font text-cyan">{{ claim.formatted }}</span>
          <span :class="['claim-status', claim.isPast ? 'past' : 'future']">{{ claim.diffText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { getJwtClaims, getJwtStatus, parseJwt } from './jwtTool.js'
import { createJwtHs256Sample, verifyJwtHs256 } from './jwtTool.js'
import { copyText } from '../../utils/clipboard.js'
import { globalToast } from '../../composables/useToast.js'

const rawJwt = ref('')
const verifyMode = ref(false)
const secret = ref('')
const showSecret = ref(false)
const verification = ref(null)
const verifying = ref(false)
const loadingSample = ref(false)
let verificationGeneration = 0
let verificationTimer

const parsedParts = computed(() => parseJwt(rawJwt.value))

const formattedHeader = computed(() => {
  if (!parsedParts.value.valid) return '// 等待有效 JWT Header'
  return JSON.stringify(parsedParts.value.header, null, 2)
})

const formattedPayload = computed(() => {
  if (!parsedParts.value.valid) return '// 等待有效 JWT Payload'
  return JSON.stringify(parsedParts.value.payload, null, 2)
})

const tokenStatus = computed(() => {
  if (!rawJwt.value.trim()) {
    return { valid: false, expired: false, notYetValid: false, text: '等待输入（仅解析，不验签）' }
  }
  return getJwtStatus(parsedParts.value, Date.now(), verifyMode.value ? verification.value : null)
})

const claimsMeta = computed(() => {
  if (!parsedParts.value.valid) return []
  return getJwtClaims(parsedParts.value.payload)
})

const signatureStatus = computed(() => {
  if (!rawJwt.value.trim()) return { kind: 'unverified', text: '未开始验签' }
  if (!parsedParts.value.valid) return { kind: 'invalid', text: 'Token 格式无效' }
  if (!verifyMode.value) return { kind: 'unverified', text: '仅解析 · 未验签' }
  if (verifying.value) return { kind: 'pending', text: '正在本地验签…' }
  if (!verification.value) return { kind: 'unverified', text: '等待输入密钥' }
  if (verification.value.status === 'verified') return { kind: 'verified', text: '签名验证通过' }
  if (verification.value.status === 'invalid-signature') return { kind: 'invalid', text: '签名验证失败' }
  if (verification.value.status === 'unsupported-algorithm') {
    return { kind: 'unsupported', text: `不支持 ${verification.value.algorithm || '该算法'}` }
  }
  if (verification.value.status === 'missing-secret') return { kind: 'unverified', text: '等待输入密钥' }
  return { kind: 'invalid', text: verification.value.error || '无法验签' }
})

watch([rawJwt, secret, verifyMode], ([token]) => {
  clearTimeout(verificationTimer)
  const generation = ++verificationGeneration
  verification.value = null
  verifying.value = false
  if (!verifyMode.value || !token.trim()) return
  verificationTimer = setTimeout(async () => {
    verifying.value = true
    try {
      const result = await verifyJwtHs256(token, secret.value)
      if (generation === verificationGeneration) verification.value = result
    } finally {
      if (generation === verificationGeneration) verifying.value = false
    }
  }, 120)
}, { immediate: true })

function clearAll() {
  rawJwt.value = ''
  secret.value = ''
  verification.value = null
  verifyMode.value = false
  showSecret.value = false
}

async function copyPart(text) {
  if (!text || !await copyText(text)) return
  globalToast('已复制 JWT 解码内容')
}

async function loadSample() {
  if (loadingSample.value) return
  loadingSample.value = true
  try {
    const sample = await createJwtHs256Sample()
    rawJwt.value = sample.token
    secret.value = sample.secret
    verifyMode.value = true
    showSecret.value = false
    globalToast('已加载真实 HS256 示例，可直接查看本地验签结果')
  } catch (error) {
    globalToast(`无法生成示例：${error.message}`, 'error')
  } finally {
    loadingSample.value = false
  }
}

onUnmounted(() => {
  verificationGeneration += 1
  clearTimeout(verificationTimer)
})
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
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  flex-wrap: wrap;
}
.jwt-tags {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}
.hud-marker {
  font-size: 0.625rem;
  font-family: var(--font-mono);
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  background: rgba(var(--rgb-primary), 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(var(--rgb-primary), 0.3);
}
.status-chip,
.signature-chip {
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
}
.status-chip.active {
  background: rgba(var(--rgb-green), 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(var(--rgb-green), 0.35);
}
.status-chip.not-yet-valid {
  background: rgba(var(--rgb-amber), 0.15);
  color: var(--accent-amber);
  border: 1px solid rgba(var(--rgb-amber), 0.35);
}
.status-chip.expired {
  background: rgba(var(--rgb-red), 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(var(--rgb-red), 0.35);
}
.status-chip.invalid {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-sub);
}
.signature-chip {
  color: var(--text-sub);
  border: 1px solid var(--border-color);
  background: var(--surface-inset);
}
.signature-chip.verified {
  color: var(--accent-green);
  border-color: rgba(var(--rgb-green), 0.4);
  background: rgba(var(--rgb-green), 0.12);
}
.signature-chip.invalid,
.signature-chip.unsupported {
  color: var(--accent-red);
  border-color: rgba(var(--rgb-red), 0.4);
  background: rgba(var(--rgb-red), 0.12);
}
.signature-chip.pending {
  color: var(--accent-amber);
  border-color: rgba(var(--rgb-amber), 0.4);
}
.actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.jwt-input-panel {
  display: flex;
  flex-direction: column;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: var(--surface-inset);
  border-bottom: 1px solid var(--border-color);
}
.panel-title {
  font-size: 0.85rem;
  font-weight: 700;
}
.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.stat-badge {
  font-size: 0.75rem;
  color: var(--text-sub);
}
.jwt-textarea {
  min-height: 110px;
  border: none;
  border-radius: 0;
  padding: 1rem 1.25rem;
  line-height: 1.6;
}
.jwt-grid {
  display: grid;
  grid-template-columns: 1fr 1.3fr;
  gap: 1.25rem;
}
.jwt-badge {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  font-weight: 800;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}
.badge-red {
  background: rgba(var(--rgb-red), 0.15);
  color: var(--accent-pink);
  border: 1px solid rgba(var(--rgb-red), 0.3);
}
.badge-purple {
  background: rgba(var(--rgb-purple), 0.15);
  color: var(--accent-purple);
  border: 1px solid rgba(var(--rgb-purple), 0.3);
}
.output-part {
  min-height: 220px;
  border: none;
  border-radius: 0;
  padding: 1rem 1.25rem;
  line-height: 1.6;
  background: transparent;
}
.text-pink {
  color: var(--accent-pink);
}
.text-purple {
  color: var(--accent-purple);
}
.text-cyan {
  color: var(--accent-cyan);
}
.verification-panel {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.verification-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.verification-title-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.verification-title {
  font-size: 0.95rem;
  font-weight: 800;
}
.verification-sub {
  margin-top: 0.35rem;
  color: var(--text-muted);
  font-size: 0.78rem;
}
.mode-switch {
  display: inline-flex;
  padding: 0.2rem;
  gap: 0.2rem;
  border: 1px solid var(--border-color);
  border-radius: 0.55rem;
  background: var(--surface-inset);
}
.mode-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  border-radius: 0.4rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
}
.mode-btn:hover {
  color: var(--text-main);
}
.mode-btn.active {
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-primary), 0.35);
  background: rgba(var(--rgb-primary), 0.12);
}
.verification-body {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.secret-field {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.secret-input-wrap {
  flex: 1;
  min-width: 280px;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.secret-input-wrap .input-control {
  flex: 1;
  min-width: 160px;
}
.verification-result {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--border-color);
  border-radius: 0.45rem;
  background: var(--surface-inset);
  font-size: 0.78rem;
  color: var(--text-muted);
}
.verification-result.verified {
  border-color: rgba(var(--rgb-green), 0.4);
  background: rgba(var(--rgb-green), 0.08);
}
.verification-result.verified strong {
  color: var(--accent-green);
}
.verification-result.invalid,
.verification-result.unsupported {
  border-color: rgba(var(--rgb-red), 0.4);
  background: rgba(var(--rgb-red), 0.08);
}
.verification-result.invalid strong,
.verification-result.unsupported strong {
  color: var(--accent-red);
}
.security-note,
.parse-only-note {
  font-size: 0.76rem;
  color: var(--text-muted);
  border-left: 2px solid var(--accent-amber);
  padding-left: 0.7rem;
}
.parse-only-note {
  border-left-color: var(--accent-cyan);
}
.claims-hud {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.claims-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.claims-title {
  font-size: 0.875rem;
  font-weight: 700;
}
.claims-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.claim-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.85rem;
  background: var(--surface-inset);
  border: 1px solid rgba(var(--rgb-primary), 0.15);
  border-radius: 0.4rem;
  font-size: 0.85rem;
  flex-wrap: wrap;
}
.claim-key {
  color: var(--text-sub);
}
.claim-status {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}
.claim-status.future {
  background: rgba(var(--rgb-green), 0.15);
  color: var(--accent-green);
}
.claim-status.past {
  background: rgba(var(--rgb-red), 0.15);
  color: var(--accent-red);
}
@media (max-width: 768px) {
  .jwt-grid {
    grid-template-columns: 1fr;
  }
  .secret-input-wrap {
    min-width: 100%;
    flex-wrap: wrap;
  }
}
</style>
