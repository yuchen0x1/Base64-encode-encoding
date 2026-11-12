<template>
  <div class="tool-content">
    <div class="tool-toolbar">
      <div class="preset-box">
        <span class="label">常用正则示例:</span>
        <select v-model="selectedPreset" @change="applyPreset" class="select-control">
          <option value="">-- 选择常用模板 --</option>
          <option value="email">电子邮箱 (Email)</option>
          <option value="phone">中国手机号 (11位)</option>
          <option value="idcard">身份证号 (18位)</option>
          <option value="url">URL 网址</option>
          <option value="ipv4">IPv4 地址</option>
          <option value="chinese">中文字符</option>
        </select>
      </div>

      <div class="flags-group">
        <label><input type="checkbox" v-model="flags.g" /> 全局 (g)</label>
        <label><input type="checkbox" v-model="flags.i" /> 忽略大小写 (i)</label>
        <label><input type="checkbox" v-model="flags.m" /> 多行匹配 (m)</label>
      </div>
    </div>

    <!-- 正则表达式输入框 -->
    <div class="tool-card regex-input-card">
      <div class="regex-bar">
        <span class="slash">/</span>
        <input
          v-model="pattern"
          type="text"
          class="input-control code-font regex-pattern"
          placeholder="在此输入正则表达式，例如: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
        />
        <span class="slash">/{{ activeFlags }}</span>
      </div>
      <div v-if="regexError" class="regex-error">
        ⚠️ {{ regexError }}
      </div>
    </div>

    <div class="workbench-grid">
      <!-- 待测试文本 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">测试文本 (Test String)</span>
          <span class="stat-badge">{{ testString.length }} 字符</span>
        </div>
        <textarea
          v-model="testString"
          class="textarea-control code-font"
          placeholder="输入需要匹配测试的文本..."
        ></textarea>
      </div>

      <!-- 匹配结果汇总 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">{{ isMatching ? '正在匹配…' : `匹配结果 (共 ${matches.length} 处命中)` }}</span>
          <span v-if="isTruncated" class="warn-badge">仅展示前 500 项</span>
        </div>
        <div class="matches-list">
          <div v-if="matches.length === 0" class="no-match">
            未发现任何匹配项
          </div>
          <div v-else>
            <div v-for="(m, idx) in matches" :key="idx" class="match-item">
              <span class="match-index">#{{ idx + 1 }}</span>
              <span class="match-val code-font">{{ m }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { createRegexMatchRunner } from '../../utils/regexMatch.js'

const pattern = ref('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}')
const testString = ref(`欢迎联系客服：service@company.com
技术支持邮箱：support@toolhelper.cn 或 dev_team-99@test.org.cn`)

const flags = ref({
  g: true,
  i: true,
  m: false
})

const selectedPreset = ref('email')
const regexError = ref('')
const isTruncated = ref(false)
const matches = ref([])
const isMatching = ref(false)
const regexMatchRunner = createRegexMatchRunner(
  () => new Worker(new URL('../../utils/regexWorker.js', import.meta.url), { type: 'module' })
)
let matchRequestId = 0

const activeFlags = computed(() => {
  let f = ''
  if (flags.value.g) f += 'g'
  if (flags.value.i) f += 'i'
  if (flags.value.m) f += 'm'
  return f
})

const presets = {
  email: {
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    sample: '联系人：alice@gmail.com, bob_123@163.com'
  },
  phone: {
    pattern: '1[3-9]\\d{9}',
    sample: '电话：13800138000、18911223344，座机：010-88888888'
  },
  idcard: {
    pattern: '[1-9]\\d{5}(18|19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[0-9Xx]',
    sample: '身份证样例: 110101199003072391'
  },
  url: {
    pattern: 'https?:\\/\\/[\\w\\-]+(\\.[\\w\\-]+)+([\\w.,@?^=%&:/~+#-]*[\\w@?^=%&/~+#-])?',
    sample: '访问网址：https://www.toolhelper.cn/ 与 http://github.com'
  },
  ipv4: {
    pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b',
    sample: '网关 IP: 192.168.1.1 本地回环: 127.0.0.1 广播: 255.255.255.255'
  },
  chinese: {
    pattern: '[\\u4e00-\\u9fa5]+',
    sample: '这是中文句子 This is English 123456 标点符号。'
  }
}

function applyPreset() {
  const p = presets[selectedPreset.value]
  if (p) {
    pattern.value = p.pattern
    testString.value = p.sample
  }
}

watch([pattern, testString, activeFlags, () => flags.value.g], async () => {
  const requestId = ++matchRequestId
  regexMatchRunner.cancel()
  regexError.value = ''
  isTruncated.value = false
  matches.value = []

  if (!pattern.value || !testString.value) {
    isMatching.value = false
    return
  }

  isMatching.value = true
  const result = await regexMatchRunner.run({
    pattern: pattern.value,
    text: testString.value,
    flags: activeFlags.value,
    global: flags.value.g
  })

  if (requestId !== matchRequestId) return
  isMatching.value = false

  if (result?.error) {
    regexError.value = result.error
    return
  }

  matches.value = result?.matches || []
  isTruncated.value = Boolean(result?.isTruncated)
}, { immediate: true })

onBeforeUnmount(() => {
  matchRequestId += 1
  regexMatchRunner.cancel()
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
.preset-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
.flags-group {
  display: flex;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.regex-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  color: var(--primary);
  font-family: var(--font-mono);
}
.regex-pattern {
  flex: 1;
  font-size: 1rem;
  font-weight: 600;
}
.regex-error {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: var(--accent-red);
}
.warn-badge {
  font-size: 0.75rem;
  color: var(--accent-amber);
  background: rgba(245, 158, 11, 0.12);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
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
  min-height: 250px;
}
.matches-list {
  padding: 0.75rem 1rem;
  max-height: 350px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.match-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg-input);
  border-radius: 0.375rem;
  font-size: 0.85rem;
}
.match-index {
  color: var(--primary);
  font-weight: 700;
}
.match-val {
  color: var(--text-main);
  word-break: break-all;
}
.no-match {
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 1rem;
  text-align: center;
}
</style>
