<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="jwt-tags">
        <span class="hud-marker">JWT DECODER</span>
        <span :class="['status-chip', tokenStatus.valid ? (tokenStatus.expired ? 'expired' : 'active') : 'invalid']">
          {{ tokenStatus.text }}
        </span>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="loadSample">📝 加载示例 Token</button>
        <button class="btn btn-secondary btn-sm" @click="rawJwt = ''">🗑️ 清空</button>
      </div>
    </div>

    <!-- 原始 JWT 输入区 -->
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

    <!-- 解码后三段式高光 HUD 展示 -->
    <div class="jwt-grid">
      <!-- Header -->
      <div class="glass-panel panel">
        <div class="panel-header header-red">
          <div class="panel-title-wrap">
            <span class="jwt-badge badge-red">HEADER</span>
            <span class="panel-title">算法与令牌类型 (ALGORITHM & TOKEN TYPE)</span>
          </div>
        </div>
        <textarea
          readonly
          class="textarea-control code-font output-part text-pink"
          :value="formattedHeader"
        ></textarea>
      </div>

      <!-- Payload -->
      <div class="glass-panel panel">
        <div class="panel-header header-purple">
          <div class="panel-title-wrap">
            <span class="jwt-badge badge-purple">PAYLOAD</span>
            <span class="panel-title">数据载荷 (DATA CLAIMS)</span>
          </div>
        </div>
        <textarea
          readonly
          class="textarea-control code-font output-part text-purple"
          :value="formattedPayload"
        ></textarea>
      </div>
    </div>

    <!-- 时效性全息审计 -->
    <div v-if="claimsMeta.length > 0" class="glass-panel claims-hud">
      <div class="claims-header">
        <span class="hud-marker">TIMESTAMP AUDIT</span>
        <span class="claims-title">标准时效声明时间轴诊断</span>
      </div>
      <div class="claims-list">
        <div v-for="c in claimsMeta" :key="c.key" class="claim-item">
          <span class="claim-key code-font">{{ c.key }} ({{ c.name }})</span>
          <span class="claim-val code-font text-cyan">{{ c.formatted }}</span>
          <span :class="['claim-status', c.isPast ? 'past' : 'future']">{{ c.diffText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const rawJwt = ref(`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkdlZWsgRGV2ZWxvcGVyIiwicm9sZXMiOlsic3VwZXJhZG1pbiIsImRldm9wcyJdLCJpYXQiOjE3OTM4NjIwMDAsImV4cCI6MTgwOTY0ODAwMH0.d41d8cd98f00b204e9800998ecf8427e`)

function base64UrlDecode(str) {
  try {
    let clean = str.replace(/-/g, '+').replace(/_/g, '/')
    while (clean.length % 4) clean += '='
    const binary = window.atob(clean)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new TextDecoder().decode(bytes)
  } catch (e) {
    return ''
  }
}

const parsedParts = computed(() => {
  const parts = rawJwt.value.trim().split('.')
  if (parts.length < 2) return { header: null, payload: null, valid: false }
  try {
    const h = JSON.parse(base64UrlDecode(parts[0]))
    const p = JSON.parse(base64UrlDecode(parts[1]))
    return { header: h, payload: p, valid: true }
  } catch (e) {
    return { header: null, payload: null, valid: false }
  }
})

const formattedHeader = computed(() => {
  if (!parsedParts.value.header) return '// 等待有效 JWT Header'
  return JSON.stringify(parsedParts.value.header, null, 2)
})

const formattedPayload = computed(() => {
  if (!parsedParts.value.payload) return '// 等待有效 JWT Payload'
  return JSON.stringify(parsedParts.value.payload, null, 2)
})

const tokenStatus = computed(() => {
  if (!rawJwt.value.trim()) return { valid: false, expired: false, text: '等待输入' }
  if (!parsedParts.value.valid) return { valid: false, expired: false, text: '⚠️ 令牌格式无效' }
  const payload = parsedParts.value.payload
  if (payload && payload.exp) {
    const expMs = payload.exp * 1000
    const isExpired = Date.now() > expMs
    return {
      valid: true,
      expired: isExpired,
      text: isExpired ? '🔴 令牌已过期' : '🟢 令牌在有效期内'
    }
  }
  return { valid: true, expired: false, text: '🔵 格式正确 (未声明过期时间)' }
})

const claimsMeta = computed(() => {
  const p = parsedParts.value.payload
  if (!p) return []
  const list = []
  const now = Date.now()

  function formatTime(sec) {
    const d = new Date(sec * 1000)
    return d.toLocaleString()
  }

  function getDiff(sec) {
    const target = sec * 1000
    const diffSec = Math.round((target - now) / 1000)
    const isPast = diffSec < 0
    const abs = Math.abs(diffSec)
    const d = Math.floor(abs / 86400)
    const h = Math.floor((abs % 86400) / 3600)
    const m = Math.floor((abs % 3600) / 60)
    const str = `${d ? d + '天 ' : ''}${h ? h + '小时 ' : ''}${m}分钟`
    return { isPast, diffText: isPast ? `已过去 ${str}` : `将在 ${str} 后到期` }
  }

  if (p.iat) {
    const diff = getDiff(p.iat)
    list.push({ key: 'iat', name: '签发时间', formatted: formatTime(p.iat), ...diff })
  }
  if (p.nbf) {
    const diff = getDiff(p.nbf)
    list.push({ key: 'nbf', name: '生效时间', formatted: formatTime(p.nbf), ...diff })
  }
  if (p.exp) {
    const diff = getDiff(p.exp)
    list.push({ key: 'exp', name: '过期时间', formatted: formatTime(p.exp), ...diff })
  }
  return list
})

function loadSample() {
  const now = Math.floor(Date.now() / 1000)
  const header = window.btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, '')
  const payload = window.btoa(JSON.stringify({
    sub: "admin-cyber-01",
    username: "Neo",
    scope: ["read", "write", "admin"],
    iat: now,
    exp: now + 3600 * 24 * 7 // 7天后过期
  })).replace(/=/g, '')
  rawJwt.value = `${header}.${payload}.SIGNATURE_HASH_HEX_VALUE`
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
}
.jwt-tags {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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
.status-chip {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.65rem;
  border-radius: 9999px;
}
.status-chip.active {
  background: rgba(var(--rgb-green), 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(var(--rgb-green), 0.35);
  box-shadow: 0 0 10px rgba(var(--rgb-green), 0.2);
}
.status-chip.expired {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(239, 68, 68, 0.35);
}
.status-chip.invalid {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-sub);
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.jwt-input-panel {
  display: flex;
  flex-direction: column;
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
.jwt-textarea {
  min-height: 100px;
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
@media (max-width: 768px) {
  .jwt-grid {
    grid-template-columns: 1fr;
  }
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
  padding: 0.55rem 0.85rem;
  background: var(--surface-inset);
  border: 1px solid rgba(var(--rgb-primary), 0.15);
  border-radius: 0.4rem;
  font-size: 0.85rem;
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
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
}
</style>
