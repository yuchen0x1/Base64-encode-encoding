<template>
  <div :class="['app-layout', isDark ? 'dark' : 'light']">
    <!-- 移动端顶部赛博导航栏 -->
    <header class="mobile-header">
      <button class="cyber-icon-btn" @click="mobileMenuOpen = !mobileMenuOpen">
        <Menu v-if="!mobileMenuOpen" :size="20" />
        <X v-else :size="20" />
      </button>
      <div class="mobile-logo">
        <span class="cyber-pulse-dot"></span>
        <span class="gradient-text">TOOLBOX PRO</span>
      </div>
      <button class="cyber-icon-btn" @click="toggleTheme">
        <Sun v-if="isDark" :size="18" class="text-amber" />
        <Moon v-else :size="18" class="text-cyan" />
      </button>
    </header>

    <!-- 侧边栏：PC常驻，移动端抽屉 -->
    <aside :class="['sidebar', mobileMenuOpen ? 'mobile-show' : '']">
      <!-- 品牌区：全息流光 Logo -->
      <div class="brand">
        <div class="brand-left">
          <div class="cyber-logo-box">
            <Cpu :size="22" class="logo-svg" />
            <span class="cyber-corner-tr"></span>
            <span class="cyber-corner-bl"></span>
          </div>
          <div>
            <div class="brand-title-wrap">
              <h1 class="brand-title gradient-text">极客工具箱</h1>
              <span class="version-chip">v1.2 PRO</span>
            </div>
            <div class="hud-status-mini">
              <span class="status-indicator-live"></span>
              <span class="hud-text">CORE ONLINE · LOCAL ENGINE</span>
            </div>
          </div>
        </div>
        <button class="cyber-icon-btn pc-only" @click="toggleTheme" :title="isDark ? '切换浅色模式' : '切换深色模式'">
          <Sun v-if="isDark" :size="16" class="text-amber" />
          <Moon v-else :size="16" class="text-cyan" />
        </button>
      </div>

      <!-- 科技感搜索框 -->
      <div class="search-box">
        <div class="search-input-wrapper">
          <Search class="search-icon" :size="16" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="呼出命令检索 (Ctrl+K)..."
            class="search-input code-font"
            @keydown.esc="searchQuery = ''"
          />
          <kbd class="cyber-kbd pc-only">⌘K</kbd>
        </div>
      </div>

      <!-- 分类过滤器 -->
      <div class="category-list">
        <div class="section-label">
          <span>模块控制台 / MODULES</span>
          <span class="sub-dot"></span>
        </div>
        <button
          v-for="cat in toolCategories"
          :key="cat.id"
          :class="['cat-item', activeCategory === cat.id ? 'active' : '']"
          @click="selectCategory(cat.id)"
        >
          <div class="cat-left">
            <component :is="categoryIconMap[cat.icon]" :size="16" class="cat-icon" />
            <span class="cat-name">{{ cat.name }}</span>
          </div>
          <span class="cat-count-badge">{{ getCategoryCount(cat.id) }}</span>
        </button>
      </div>

      <!-- 侧边栏底部 HUD 监控台 -->
      <div class="sidebar-footer">
        <div class="hud-stats-card">
          <div class="hud-stat-item">
            <span class="hud-num gradient-cyan">187+</span>
            <span class="hud-sub">算法就绪</span>
          </div>
          <div class="hud-divider"></div>
          <div class="hud-stat-item">
            <span class="hud-num gradient-green">0.0 ms</span>
            <span class="hud-sub">本地延迟</span>
          </div>
          <div class="hud-divider"></div>
          <div class="hud-stat-item">
            <span class="hud-num gradient-purple">100%</span>
            <span class="hud-sub">隐私沙箱</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm directory-btn" @click="showCatalogModal = true">
          <Layers :size="14" />
          <span>187 款全量全景图谱</span>
        </button>
      </div>
    </aside>

    <!-- 移动端遮罩 -->
    <div v-if="mobileMenuOpen" class="mobile-backdrop" @click="mobileMenuOpen = false"></div>

    <!-- 主工作区 -->
    <main class="main-viewport">
      <!-- PC 端多标签页科技工作台 -->
      <div class="workbench-tabs pc-only">
        <div class="tabs-scroll">
          <div
            v-for="tab in openTabs"
            :key="tab.id"
            :class="['tab-item', currentToolId === tab.id ? 'active' : '']"
            @click="switchTool(tab.id)"
          >
            <span class="tab-glow-indicator"></span>
            <span class="tab-title">{{ tab.name }}</span>
            <button class="tab-close" @click.stop="closeTab(tab.id)" title="关闭标签">
              <X :size="12" />
            </button>
          </div>
        </div>
        <div class="tabs-right-status">
          <span class="sys-chip">
            <span class="pulse-green"></span>
            OFFLINE READY
          </span>
        </div>
      </div>

      <!-- 移动端常用分类快捷横滑胶囊 -->
      <div class="mobile-capsules mobile-only">
        <button
          v-for="cat in toolCategories"
          :key="cat.id"
          :class="['capsule-pill', activeCategory === cat.id ? 'active' : '']"
          @click="selectCategory(cat.id)"
        >
          {{ cat.name }}
        </button>
      </div>

      <!-- 工作空间主体 -->
      <div class="workspace-body">
        <!-- 头部全息信息栏 -->
        <div class="tool-meta-header" v-if="currentTool">
          <div>
            <div class="tool-title-row">
              <h2 class="current-tool-title gradient-text">{{ currentTool.name }}</h2>
              <span class="badge-neon">{{ getCategoryName(currentTool.category) }}</span>
              <span class="badge-green">
                <ShieldCheck :size="12" style="margin-right: 3px;" />
                零网络请求 · 本地内存计算
              </span>
            </div>
            <p class="current-tool-desc">{{ currentTool.description }}</p>
          </div>
          <div class="tool-header-actions pc-only">
            <button 
              :class="['btn', isFavorite(currentTool.id) ? 'btn-primary' : 'btn-secondary', 'btn-sm']"
              @click="toggleFavorite(currentTool.id)"
            >
              <Star :size="14" :fill="isFavorite(currentTool.id) ? 'currentColor' : 'none'" />
              <span>{{ isFavorite(currentTool.id) ? '已加常用' : '常用置顶' }}</span>
            </button>
          </div>
        </div>

        <!-- 嵌入工具组件 -->
        <div class="tool-component-wrapper">
          <component :is="currentToolComponent" v-if="currentToolComponent" />
          <div v-else class="tool-not-found glass-panel">
            <p>该功能正在接入中，已规划在全量离线工具库内。</p>
          </div>
        </div>

        <!-- 快速切换其他相关工具 (科技网格抽屉) -->
        <div class="quick-tools-section" v-if="filteredTools.length > 1">
          <div class="section-title">
            <div class="section-title-left">
              <Sparkles :size="16" class="text-cyan" />
              <span>同分类极速导航 ({{ activeCategoryName }})</span>
            </div>
            <span class="count-tip">共 {{ filteredTools.length }} 款即时可用</span>
          </div>
          <div class="tools-grid">
            <div
              v-for="item in filteredTools"
              :key="item.id"
              :class="['mini-tool-card', currentToolId === item.id ? 'current' : '']"
              @click="openTool(item)"
            >
              <div class="card-glow-bg"></div>
              <div class="card-top">
                <span class="mini-title">{{ item.name }}</span>
                <span v-if="item.isCommon" class="hot-badge">TOP</span>
              </div>
              <p class="mini-desc">{{ item.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- 187款工具全量图谱科技感全屏模态框 -->
    <div v-if="showCatalogModal" class="modal-backdrop" @click="showCatalogModal = false">
      <div class="modal-card glass-panel" @click.stop>
        <div class="modal-header">
          <div>
            <div class="modal-title-wrap">
              <Layers class="text-cyan" :size="20" />
              <h3 class="modal-title gradient-text">187+ 全量工具矩阵图谱 (TOOLHELPER.CN)</h3>
            </div>
            <p class="modal-sub">全栈架构逆向归集完成，绿色边框高亮为已内置零延迟秒开工具</p>
          </div>
          <button class="cyber-close-btn" @click="showCatalogModal = false">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body">
          <div v-for="cat in allCatalog" :key="cat.category" class="catalog-category-block">
            <h4 class="cat-block-title">
              <span class="cat-title-text">{{ cat.category }}</span>
              <span class="badge-neon">{{ cat.tools.length }} 款</span>
            </h4>
            <div class="catalog-items-grid">
              <div
                v-for="t in cat.tools"
                :key="t.name"
                :class="['catalog-item-badge', isNativeTool(t.name) ? 'native' : '']"
              >
                <span>{{ t.name }}</span>
                <span v-if="isNativeTool(t.name)" class="native-tag">● 本地秒开</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  Cpu,
  Search,
  Menu,
  X,
  Sun,
  Moon,
  LayoutGrid,
  Sparkles,
  Binary,
  ShieldCheck,
  FileCode2,
  FileText,
  Calculator,
  Clock,
  Image,
  Globe,
  Hash,
  Lock,
  Regex,
  GitCompare,
  QrCode,
  KeyRound,
  AlignLeft,
  Star,
  Layers
} from 'lucide-vue-next'

import { toolCategories, toolsList } from './config/tools.js'
import catalogJson from '../toolhelper_directory.json'

// 动态工具组件导入
import ToolBase64 from './components/tools/ToolBase64.vue'
import ToolJson from './components/tools/ToolJson.vue'
import ToolHash from './components/tools/ToolHash.vue'
import ToolTimestamp from './components/tools/ToolTimestamp.vue'
import ToolQrcode from './components/tools/ToolQrcode.vue'
import ToolUrl from './components/tools/ToolUrl.vue'
import ToolRadix from './components/tools/ToolRadix.vue'
import ToolDiff from './components/tools/ToolDiff.vue'
import ToolRegex from './components/tools/ToolRegex.vue'
import ToolPassword from './components/tools/ToolPassword.vue'
import ToolJwt from './components/tools/ToolJwt.vue'
import ToolUnicode from './components/tools/ToolUnicode.vue'
import ToolCipher from './components/tools/ToolCipher.vue'
import ToolImageBase64 from './components/tools/ToolImageBase64.vue'

const categoryIconMap = {
  LayoutGrid,
  Sparkles,
  Binary,
  ShieldCheck,
  FileCode2,
  FileText,
  Calculator,
  Clock,
  Image
}

const toolComponentsMap = {
  'base64': ToolBase64,
  'jwt-decoder': ToolJwt,
  'unicode-codec': ToolUnicode,
  'cipher-toolbox': ToolCipher,
  'image-base64': ToolImageBase64,
  'json-format': ToolJson,
  'hash-crypto': ToolHash,
  'timestamp': ToolTimestamp,
  'qrcode-generator': ToolQrcode,
  'url-codec': ToolUrl,
  'radix-convert': ToolRadix,
  'text-diff': ToolDiff,
  'regex-tester': ToolRegex,
  'random-password': ToolPassword,
  'aes-crypto': ToolHash,
  'text-toolbox': ToolDiff
}

// 状态管理
const isDark = ref(true)
const mobileMenuOpen = ref(false)
const showCatalogModal = ref(false)
const searchQuery = ref('')
const activeCategory = ref('all')
const currentToolId = ref('base64')
const favorites = ref(['base64', 'json-format', 'timestamp', 'url-codec', 'radix-convert'])

// 多标签管理
const openTabs = ref([
  toolsList.find(t => t.id === 'base64'),
  toolsList.find(t => t.id === 'json-format'),
  toolsList.find(t => t.id === 'timestamp'),
  toolsList.find(t => t.id === 'radix-convert')
].filter(Boolean))

const allCatalog = ref(catalogJson)

// 主题切换
function toggleTheme() {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// 计算当前工具
const currentTool = computed(() => {
  return toolsList.find(t => t.id === currentToolId.value) || toolsList[0]
})

const currentToolComponent = computed(() => {
  return toolComponentsMap[currentToolId.value]
})

const activeCategoryName = computed(() => {
  const c = toolCategories.find(item => item.id === activeCategory.value)
  return c ? c.name : '全部'
})

// 分类与搜索过滤
const filteredTools = computed(() => {
  let list = toolsList
  if (activeCategory.value === 'common') {
    list = list.filter(t => t.isCommon || favorites.value.includes(t.id))
  } else if (activeCategory.value !== 'all') {
    list = list.filter(t => t.category === activeCategory.value)
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }
  return list
})

function getCategoryCount(catId) {
  if (catId === 'all') return toolsList.length
  if (catId === 'common') return toolsList.filter(t => t.isCommon).length
  return toolsList.filter(t => t.category === catId).length
}

function getCategoryName(catId) {
  const cat = toolCategories.find(c => c.id === catId)
  return cat ? cat.name : '工具'
}

function selectCategory(catId) {
  activeCategory.value = catId
  mobileMenuOpen.value = false
}

function openTool(tool) {
  currentToolId.value = tool.id
  if (!openTabs.value.some(t => t.id === tool.id)) {
    openTabs.value.push(tool)
  }
  mobileMenuOpen.value = false
}

function switchTool(toolId) {
  currentToolId.value = toolId
}

function closeTab(toolId) {
  if (openTabs.value.length === 1) return
  const idx = openTabs.value.findIndex(t => t.id === toolId)
  if (idx !== -1) {
    openTabs.value.splice(idx, 1)
    if (currentToolId.value === toolId) {
      currentToolId.value = openTabs.value[Math.max(0, idx - 1)].id
    }
  }
}

function toggleFavorite(id) {
  const idx = favorites.value.indexOf(id)
  if (idx > -1) {
    favorites.value.splice(idx, 1)
  } else {
    favorites.value.push(id)
  }
}

function isFavorite(id) {
  return favorites.value.includes(id)
}

function isNativeTool(name) {
  const keywords = ['Base64', 'JSON', 'URL', 'MD5', 'SHA', '时间戳', '二维码', '进制', '对比', '正则', '密码']
  return keywords.some(k => name.includes(k))
}

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    const input = document.querySelector('.search-input')
    if (input) input.focus()
  }
}

onMounted(() => {
  document.documentElement.classList.add('dark')
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-app);
  color: var(--text-main);
  position: relative;
  z-index: 1;
}

/* 渐变流光文字 */
.gradient-text {
  background: linear-gradient(135deg, #38bdf8 0%, #22d3ee 50%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.gradient-cyan {
  color: var(--accent-cyan);
}
.gradient-green {
  color: var(--accent-green);
}
.gradient-purple {
  color: var(--accent-purple);
}
.text-cyan {
  color: var(--accent-cyan);
}
.text-amber {
  color: #fbbf24;
}

/* 移动端顶部标题栏 */
.mobile-header {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 54px;
  background-color: var(--bg-sidebar);
  backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--border-color);
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  z-index: 50;
}
.mobile-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  font-size: 0.95rem;
}
.cyber-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 10px var(--accent-cyan);
  animation: pulse 2s infinite;
}

/* 侧边栏 */
.sidebar {
  width: 270px;
  background-color: var(--bg-sidebar);
  backdrop-filter: var(--glass-blur);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 40;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.15rem;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.05) 0%, transparent 100%);
}
.brand-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.cyber-logo-box {
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  position: relative;
  box-shadow: var(--glow-primary);
}
.cyber-corner-tr {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 6px;
  height: 6px;
  border-top: 2px solid var(--accent-cyan);
  border-right: 2px solid var(--accent-cyan);
}
.cyber-corner-bl {
  position: absolute;
  bottom: -2px;
  left: -2px;
  width: 6px;
  height: 6px;
  border-bottom: 2px solid var(--accent-cyan);
  border-left: 2px solid var(--accent-cyan);
}
.brand-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.brand-title {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.version-chip {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  background: rgba(192, 132, 252, 0.15);
  border: 1px solid rgba(192, 132, 252, 0.3);
  color: var(--accent-purple);
  border-radius: 4px;
}
.hud-status-mini {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.15rem;
}
.status-indicator-live {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
}
.hud-text {
  font-size: 0.625rem;
  color: var(--text-sub);
  letter-spacing: 0.05em;
  font-family: var(--font-mono);
}

.cyber-icon-btn {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  border-radius: 0.375rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.cyber-icon-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  box-shadow: var(--glow-primary);
}

/* 搜索栏 */
.search-box {
  margin: 0.85rem 1rem;
}
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 0.85rem;
  color: var(--accent-cyan);
  opacity: 0.8;
}
.search-input {
  width: 100%;
  padding: 0.55rem 2.5rem 0.55rem 2.4rem;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  color: var(--text-main);
  font-size: 0.8rem;
  outline: none;
  transition: all 0.2s ease;
}
.search-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
}
.cyber-kbd {
  position: absolute;
  right: 0.6rem;
  font-size: 0.65rem;
  font-family: var(--font-mono);
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.25);
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  color: var(--accent-cyan);
}

/* 分类列表 */
.category-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--text-sub);
  padding: 0.5rem 0.5rem 0.35rem;
  font-family: var(--font-mono);
  font-weight: 600;
}
.sub-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary);
  opacity: 0.6;
}
.cat-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  border-radius: 0.45rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cat-left {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}
.cat-icon {
  color: var(--text-sub);
  transition: color 0.15s ease;
}
.cat-item:hover {
  background-color: var(--bg-card-hover);
  color: var(--text-main);
  border-color: rgba(56, 189, 248, 0.15);
}
.cat-item:hover .cat-icon {
  color: var(--primary);
}
.cat-item.active {
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.15) 0%, rgba(34, 211, 238, 0.05) 100%);
  color: var(--accent-cyan);
  border-color: rgba(56, 189, 248, 0.3);
  font-weight: 600;
  box-shadow: 0 0 15px rgba(56, 189, 248, 0.1);
}
.cat-item.active .cat-icon {
  color: var(--accent-cyan);
}
.cat-count-badge {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
  background: var(--bg-input);
  color: var(--text-sub);
}
.cat-item.active .cat-count-badge {
  background: rgba(56, 189, 248, 0.2);
  color: var(--accent-cyan);
}

/* 侧边栏底部 HUD 监控台 */
.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(0deg, rgba(56, 189, 248, 0.05) 0%, transparent 100%);
}
.hud-stats-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  padding: 0.55rem 0.75rem;
  border-radius: 0.5rem;
}
.hud-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.hud-num {
  font-size: 0.875rem;
  font-weight: 800;
  font-family: var(--font-mono);
}
.hud-sub {
  font-size: 0.625rem;
  color: var(--text-sub);
}
.hud-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
}
.directory-btn {
  width: 100%;
}

/* 主视口 */
.main-viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}

/* PC 多标签栏 */
.workbench-tabs {
  height: 44px;
  background-color: var(--bg-sidebar);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  overflow-x: auto;
}
.tabs-scroll {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.tab-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.95rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.4rem;
  font-size: 0.825rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  position: relative;
}
.tab-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-main);
}
.tab-item.active {
  background: var(--bg-card);
  color: var(--accent-cyan);
  border-color: rgba(56, 189, 248, 0.35);
  font-weight: 600;
  box-shadow: 0 0 15px rgba(56, 189, 248, 0.15);
}
.tab-glow-indicator {
  display: none;
  position: absolute;
  top: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
}
.tab-item.active .tab-glow-indicator {
  display: block;
}
.tab-close {
  background: transparent;
  border: none;
  color: var(--text-sub);
  cursor: pointer;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  transition: all 0.15s ease;
}
.tab-close:hover {
  background: rgba(239, 68, 68, 0.2);
  color: var(--accent-red);
}
.sys-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.675rem;
  font-family: var(--font-mono);
  color: var(--accent-green);
  background: rgba(52, 211, 153, 0.1);
  border: 1px solid rgba(52, 211, 153, 0.25);
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
}
.pulse-green {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}

/* 工作空间主体 */
.workspace-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* 工具顶部信息 */
.tool-meta-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}
.tool-title-row {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}
.current-tool-title {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.current-tool-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
}

/* 工具嵌入框 */
.tool-component-wrapper {
  flex: 1;
}

/* 快速切换网格 */
.quick-tools-section {
  margin-top: 1.75rem;
  border-top: 1px solid var(--border-color);
  padding-top: 1.5rem;
}
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}
.section-title-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 700;
}
.count-tip {
  font-size: 0.8rem;
  color: var(--text-sub);
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 0.85rem;
}
.mini-tool-card {
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border-color);
  border-radius: 0.55rem;
  padding: 0.85rem 1.15rem;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.mini-tool-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
}
.mini-tool-card.current {
  border-color: var(--accent-cyan);
  background: rgba(56, 189, 248, 0.08);
}
.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mini-title {
  font-size: 0.9rem;
  font-weight: 700;
}
.hot-badge {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  color: var(--accent-red);
  background: rgba(251, 113, 133, 0.12);
  border: 1px solid rgba(251, 113, 133, 0.3);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
.mini-desc {
  font-size: 0.775rem;
  color: var(--text-muted);
  margin-top: 0.35rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 全量图谱模态框 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1.5rem;
}
.modal-card {
  width: 100%;
  max-width: 950px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  border: 1px solid rgba(56, 189, 248, 0.3);
}
.modal-header {
  padding: 1.25rem 1.75rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.modal-title {
  font-size: 1.15rem;
  font-weight: 800;
}
.modal-sub {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}
.cyber-close-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  width: 32px;
  height: 32px;
  border-radius: 0.375rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.cyber-close-btn:hover {
  border-color: var(--accent-red);
  color: var(--accent-red);
}
.modal-body {
  padding: 1.75rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.cat-block-title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}
.cat-title-text {
  font-size: 0.95rem;
  font-weight: 700;
}
.catalog-items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.5rem;
}
.catalog-item-badge {
  padding: 0.45rem 0.75rem;
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 0.4rem;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.15s ease;
}
.catalog-item-badge.native {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.08);
  color: var(--accent-green);
  box-shadow: 0 0 10px rgba(52, 211, 153, 0.1);
}
.native-tag {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--accent-green);
}

/* 响应式媒体查询（移动端适配） */
@media (max-width: 768px) {
  .pc-only {
    display: none !important;
  }
  .mobile-only {
    display: flex !important;
  }
  .mobile-header {
    display: flex;
  }
  .sidebar {
    position: fixed;
    top: 54px;
    bottom: 0;
    left: 0;
    transform: translateX(-100%);
    width: 82%;
    max-width: 320px;
    box-shadow: var(--shadow-lg);
  }
  .sidebar.mobile-show {
    transform: translateX(0);
  }
  .mobile-backdrop {
    position: fixed;
    inset: 54px 0 0 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    z-index: 35;
  }
  .main-viewport {
    margin-top: 54px;
  }
  .workspace-body {
    padding: 1rem;
    gap: 1.25rem;
  }
  .mobile-capsules {
    display: flex;
    overflow-x: auto;
    padding: 0.65rem 1rem;
    gap: 0.5rem;
    background: var(--bg-sidebar);
    border-bottom: 1px solid var(--border-color);
  }
  .capsule-pill {
    flex-shrink: 0;
    padding: 0.35rem 0.85rem;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 9999px;
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-muted);
    cursor: pointer;
  }
  .capsule-pill.active {
    background: linear-gradient(135deg, var(--accent-cyan) 0%, var(--primary) 100%);
    color: #030712;
    border-color: var(--accent-cyan);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
  }
}
@media (min-width: 769px) {
  .mobile-only {
    display: none !important;
  }
}
</style>
