<template>
  <div class="tool-content">
    <div class="glass-panel tool-toolbar">
      <div class="jwt-tags">
        <span class="hud-marker">JWT GENERATOR</span>
        <span :class="['status-chip', generatedToken ? 'active' : '']">
          {{ generatedToken ? '🟢 令牌已生成' : '⚪ 等待生成' }}
        </span>
      </div>
      <div class="actions">
        <button class="btn btn-secondary btn-sm" @click="loadSample">📝 载入示例载荷</button>
        <button class="btn btn-primary btn-sm" @click="generateToken" :disabled="!headerJson || !payloadJson">
          ⚡ 生成 JWT
        </button>
        <button class="btn btn-secondary btn-sm" @click="copyToken" :disabled="!generatedToken">
          {{ copied ? '已复制 ✔' : '一键复制' }}
        </button>
      </div>
    </div>

    <div class="jwt-grid">
      <!-- Header -->
      <div class="glass-panel panel">
        <div class="panel-header header-red">
          <div class="panel-title-wrap">
            <span class="jwt-badge badge-red">HEADER</span>
            <span class="panel-title">算法头部 (JSON)</span>
          </div>
        </div>
        <textarea
          v-model="headerJson"
          class="textarea-control code-font output-part text-pink"
          spellcheck="false"
        ></textarea>
      </div>

      <!-- Payload -->
      <div class="glass-panel panel">
        <div class="panel-header header-purple">
          <div class="panel-title-wrap">
            <span class="jwt-badge badge-purple">PAYLOAD</span>
            <span class="panel-title">数据载荷 (JSON)</span>
          </div>
        </div>
        <textarea
          v-model="payloadJson"
          class="textarea-control code-font output-part text-purple"
          spellcheck="false"
        ></textarea>
      </div>
    </div>

    <!-- 签名密钥 -->
    <div class="glass-panel key-config">
      <label class="param-item">
        <span class="param-label">签名密钥 SECRET:</span>
        <input v-model="secret" type="text" class="input-control code-font" placeholder="输入 HS256 签名密钥..." />
      </label>
      <label class="param-item">
        <span class="param-label">有效期 (秒):</span>
        <input v-model.number="expirySeconds" type="number" class="input-control code-font" min="0" />
      </label>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="glass-panel error-box">
      <span class="error-badge">⚠️ {{ error }}</span>
    </div>

    <!-- 生成的 Token -->
    <div class="glass-panel panel token-panel">
      <div class="panel-header">
        <span class="panel-title">生成的 TOKEN (HS256)</span>
        <span class="stat-badge code-font">{{ generatedToken.length }} CHARS</span>
      </div>
      <textarea
        v-model="generatedToken"
        readonly
        class="textarea-control code-font token-output"
        placeholder="生成的 JWT Token 将显示于此..."
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { globalToast } from '../../composables/useToast.js'
import { signJwtHs256 } from './jwtGeneratorTool.js'

const headerJson = ref(JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2))
const payloadJson = ref('')
const secret = ref('my_secure_secret')
const expirySeconds = ref(3600)
const generatedToken = ref('')
const copied = ref(false)
const error = ref('')

watch([headerJson, payloadJson, secret, expirySeconds], () => {
  generatedToken.value = ''
  copied.value = false
  error.value = ''
})

function generateToken() {
  error.value = ''
  const result = signJwtHs256({
    headerJson: headerJson.value,
    payloadJson: payloadJson.value,
    secret: secret.value,
    expirySeconds: expirySeconds.value
  })
  if (!result.ok) {
    generatedToken.value = ''
    copied.value = false
    error.value = result.error
    return
  }
  generatedToken.value = result.token
  copied.value = false
  globalToast('JWT Token 已生成')
}

function copyToken() {
  if (!generatedToken.value) return
  navigator.clipboard.writeText(generatedToken.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
  globalToast('已复制 JWT Token')
}

function loadSample() {
  const now = Math.floor(Date.now() / 1000)
  payloadJson.value = JSON.stringify({
    sub: 'admin-cyber-01',
    username: 'Neo',
    scope: ['read', 'write', 'admin'],
    iat: now,
    exp: now + 3600 * 24 * 7
  }, null, 2)
}
</script>

<style scoped>
.tool-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
}
.tool-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
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
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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
.panel-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.stat-badge {
  font-size: 0.75rem;
  color: var(--text-sub);
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
  resize: vertical;
}
.text-pink {
  color: var(--accent-pink);
}
.text-purple {
  color: var(--accent-purple);
}
.key-config {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.85rem 1.25rem;
}
.key-config .param-item {
  flex: 1;
  min-width: 240px;
}
.param-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.param-label {
  color: var(--text-sub);
  font-size: 0.8rem;
  white-space: nowrap;
}
.error-box {
  padding: 0.7rem 1.25rem;
}
.error-badge {
  font-size: 0.8rem;
  color: var(--accent-red);
}
.token-panel {
  flex: 1;
}
.token-output {
  min-height: 120px;
  border: none;
  border-radius: 0;
  padding: 1rem 1.25rem;
  line-height: 1.6;
  background: transparent;
  color: var(--accent-cyan);
}
</style>