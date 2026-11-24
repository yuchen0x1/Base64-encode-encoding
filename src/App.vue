<template>
  <div :class="['app-layout', isDark ? 'dark' : 'light']">
    <!-- 窄窗口顶部赛博导航栏 -->
    <header class="mobile-header">
      <button class="cyber-icon-btn" :aria-label="t(mobileMenuOpen ? 'closeMenu' : 'openMenu')" @click="mobileMenuOpen = !mobileMenuOpen">
        <Menu v-if="!mobileMenuOpen" :size="20" />
        <X v-else :size="20" />
      </button>
      <div class="mobile-logo">
        <span class="cyber-pulse-dot"></span>
        <span class="gradient-text">TOOLBOX PRO</span>
      </div>
      <div class="mobile-header-right">
        <button class="cyber-icon-btn" :aria-label="t('feedback')" :title="t('feedback')" @click="feedbackOpen = true">
          <MessageCircle :size="18" />
        </button>
        <button class="cyber-icon-btn" :aria-label="t(isDark ? 'lightTheme' : 'darkTheme')" @click="toggleTheme">
          <Sun v-if="isDark" :size="18" class="text-amber" />
          <Moon v-else :size="18" class="text-cyan" />
        </button>
      </div>
    </header>

    <!-- 侧边栏：宽窗口常驻，窄窗口抽屉 -->
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
              <h1 class="brand-title gradient-text">{{ t('brand') }}</h1>
              <button
                :class="['version-chip', hasUpdate ? 'has-update' : '']"
                :title="hasUpdate ? `${t('updateAvailable')} v${updaterState.latest?.version}` : t('checkUpdate')"
                @click="openUpdatePanel"
              >
                <span>v{{ updaterState.currentVersion }}</span>
                <span v-if="hasUpdate" class="update-ping"></span>
              </button>
            </div>
            <div class="hud-status-mini">
              <span class="status-indicator-live"></span>
              <span class="hud-text">CORE ONLINE · LOCAL ENGINE</span>
            </div>
          </div>
        </div>
        <div class="brand-actions">
          <label class="locale-picker" :title="t('language')">
            <span class="sr-only">{{ t('language') }}</span>
            <select v-model="localeSetting" :aria-label="t('language')" @change="saveState">
              <option value="auto">{{ t('auto') }}</option>
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <button class="cyber-icon-btn pc-only" @click="toggleTheme" :title="t(isDark ? 'lightTheme' : 'darkTheme')">
            <Sun v-if="isDark" :size="16" class="text-amber" />
            <Moon v-else :size="16" class="text-cyan" />
          </button>
        </div>
      </div>

      <!-- 科技感搜索框 -->
      <div class="search-box">
        <div class="search-input-wrapper">
          <Search class="search-icon" :size="16" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('searchPlaceholder')"
            :aria-label="t('searchAria')"
            aria-keyshortcuts="Control+K Meta+K"
            class="search-input code-font"
            @keydown.esc="searchQuery = ''"
          />
          <button class="cyber-kbd pc-only" type="button" title="Ctrl+K / Cmd+K" aria-label="Ctrl+K / Cmd+K" @click="openCommandPalette">Ctrl K</button>
        </div>
      </div>

      <!-- 分类过滤器 -->
      <div class="category-list">
        <div class="section-label">
          <span>{{ t('modules') }}</span>
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
            <span class="hud-num gradient-cyan">{{ toolsList.length }}</span>
            <span class="hud-sub">{{ t('localTools') }}</span>
          </div>
          <div class="hud-divider"></div>
          <div class="hud-stat-item">
            <span class="hud-num gradient-green">{{ t('localComputeShort') }}</span>
            <span class="hud-sub">{{ t('computeLocation') }}</span>
          </div>
          <div class="hud-divider"></div>
          <div class="hud-stat-item">
            <span class="hud-num gradient-purple">{{ t('noUploadShort') }}</span>
            <span class="hud-sub">{{ t('noUpload') }}</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm directory-btn" @click="showCatalogModal = true">
          <Layers :size="14" />
          <span>{{ t('catalog', { count: catalogToolCount }) }}</span>
        </button>
        <!-- 交流群入口：点击打开反馈弹窗（群二维码 / 一键加群 / 复制链接） -->
        <button class="btn btn-secondary btn-sm community-btn" :title="t('feedback')" @click="feedbackOpen = true">
          <MessageCircle :size="14" />
          <span>{{ t('community') }}</span>
          <span class="community-dot"></span>
        </button>
        <div class="workspace-actions" :aria-label="t('workspaceAria')">
          <button class="btn btn-secondary btn-sm workspace-action" :title="t('exportTitle')" @click="exportWorkspace">
            <Download :size="14" />
            <span>{{ t('exportWorkspace') }}</span>
          </button>
          <button class="btn btn-secondary btn-sm workspace-action" :title="t('importTitle')" @click="workspaceFileInput?.click()">
            <Upload :size="14" />
            <span>{{ t('importWorkspace') }}</span>
          </button>
          <input
            ref="workspaceFileInput"
            class="hidden-file-input"
            type="file"
            accept="application/json,.json"
            :aria-label="t('chooseBackup')"
            @change="handleWorkspaceImport"
          />
        </div>
      </div>
    </aside>

    <!-- 窄窗口遮罩 -->
    <div v-if="mobileMenuOpen" class="mobile-backdrop" @click="mobileMenuOpen = false"></div>

    <!-- 主工作区 -->
    <main class="main-viewport">
      <!-- PC 端多标签页科技工作台 -->
      <div class="workbench-tabs pc-only" role="tablist" :aria-label="t('openTools')">
        <div class="tabs-scroll">
          <div
            v-for="tab in openTabs"
            :key="tab.id"
            :class="['tab-item', currentToolId === tab.id ? 'active' : '']"
            :data-tab-id="tab.id"
            role="tab"
            :aria-selected="currentToolId === tab.id"
            :tabindex="currentToolId === tab.id ? 0 : -1"
            @click="switchTool(tab.id)"
            @keydown="handleTabKeydown($event, tab.id)"
          >
            <span class="tab-glow-indicator"></span>
            <span class="tab-title">{{ tab.name }}</span>
            <button class="tab-close" :aria-label="`${t('close')} ${tab.name}`" @click.stop="closeTab(tab.id)" :title="t('close')">
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

      <!-- 窄窗口常用分类快捷横滑胶囊 -->
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
                {{ t('localCompute') }}
              </span>
            </div>
            <p class="current-tool-desc">{{ currentTool.description }}</p>
          </div>
          <div class="tool-header-actions">
            <button class="btn btn-secondary btn-sm pc-only" :title="t('feedback')" @click="feedbackOpen = true">
              <MessageCircle :size="14" />
              <span>{{ t('feedbackShort') }}</span>
            </button>
            <button
              :class="['btn', isFavorite(currentTool.id) ? 'btn-primary' : 'btn-secondary', 'btn-sm']"
              :aria-pressed="isFavorite(currentTool.id)"
              @click="toggleFavorite(currentTool.id)"
            >
              <Star :size="14" :fill="isFavorite(currentTool.id) ? 'currentColor' : 'none'" />
              <span>{{ t(isFavorite(currentTool.id) ? 'favoriteAdded' : 'favorite') }}</span>
            </button>
          </div>
        </div>

        <!-- 嵌入工具组件 -->
        <div class="tool-component-wrapper">
          <KeepAlive v-if="currentToolComponent" :max="toolsList.length">
            <component :is="currentToolComponent" :key="currentToolId" />
          </KeepAlive>
          <div v-else class="tool-not-found glass-panel">
            <p>{{ t('notFound') }}</p>
          </div>
        </div>

        <!-- 快速切换其他相关工具 (科技网格抽屉) -->
        <div class="quick-tools-section" v-if="filteredTools.length">
          <div class="section-title">
            <div class="section-title-left">
              <Sparkles :size="16" class="text-cyan" />
              <span>{{ t('quickNav', { category: activeCategoryName }) }}</span>
            </div>
            <span class="count-tip">{{ t('availableCount', { count: filteredTools.length }) }}</span>
          </div>
          <div class="tools-grid">
            <button
              v-for="item in filteredTools"
              :key="item.id"
              type="button"
              :data-tool-id="item.id"
              :aria-label="`${t('open')} ${item.name}`"
              :class="['mini-tool-card', currentToolId === item.id ? 'current' : '']"
              @click="openTool(item)"
            >
              <span class="card-glow-bg"></span>
              <span class="card-top">
                <span class="mini-title">{{ item.name }}</span>
                <span v-if="item.isCommon" class="hot-badge">TOP</span>
              </span>
              <span class="mini-desc">{{ item.description }}</span>
            </button>
          </div>
        </div>
        <div v-else class="quick-tools-section empty-search" role="status">
          <p>{{ t('noMatches') }}</p>
          <button class="btn btn-secondary btn-sm" @click="searchQuery = ''; activeCategory = 'all'">{{ t('reset') }}</button>
        </div>
      </div>
    </main>

    <!-- 全局 Toast 通知 -->
    <ToastContainer />

    <!-- Windows 版本更新弹窗 -->
    <UpdateModal />

    <!-- 反馈 & 交流群弹窗（QQ 群二维码 / 一键加群 / 复制链接） -->
    <FeedbackModal v-model:open="feedbackOpen" />

    <!-- 全局命令面板：Ctrl/Cmd+K -->
    <CommandPalette
      :open="commandPaletteOpen"
      :commands="commandPaletteCommands"
      :labels="commandPaletteLabels"
      @close="closeCommandPalette"
      @select="executeCommand"
    />

    <!-- 快捷键帮助 -->
    <div v-if="shortcutsOpen" class="modal-backdrop shortcuts-backdrop" @click="closeShortcuts" @keydown.esc="closeShortcuts" @keydown.tab="trapShortcutsFocus">
      <div class="modal-card glass-panel shortcuts-card" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" @click.stop>
        <div class="modal-header">
          <div>
            <div class="modal-title-wrap">
              <Keyboard class="text-cyan" :size="20" />
              <h3 id="shortcuts-title" class="modal-title gradient-text">{{ t('shortcutsTitle') }}</h3>
            </div>
            <p class="modal-sub">{{ t('shortcutsSubtitle') }}</p>
          </div>
          <button ref="shortcutsCloseButton" class="cyber-close-btn" :aria-label="t('shortcutsClose')" @click="closeShortcuts">
            <X :size="20" />
          </button>
        </div>
        <div class="modal-body shortcuts-body">
          <div class="shortcut-row"><span>{{ t('shortcutCommandPalette') }}</span><kbd>Ctrl / ⌘</kbd><kbd>K</kbd></div>
          <div class="shortcut-row"><span>{{ t('shortcutPaletteNavigate') }}</span><kbd>↑</kbd><kbd>↓</kbd></div>
          <div class="shortcut-row"><span>{{ t('shortcutPaletteRun') }}</span><kbd>Enter</kbd></div>
          <div class="shortcut-row"><span>{{ t('shortcutTheme') }}</span><kbd>Ctrl / ⌘</kbd><kbd>Shift</kbd><kbd>T</kbd></div>
          <div class="shortcut-row"><span>{{ t('shortcutTabs') }}</span><kbd>←</kbd><kbd>→</kbd></div>
          <div class="shortcut-row"><span>{{ t('shortcutsClose') }}</span><kbd>Esc</kbd></div>
          <p class="shortcuts-hint">{{ t('shortcutsHint') }}</p>
        </div>
      </div>
    </div>

    <!-- 外部工具目录图谱 -->
    <div v-if="showCatalogModal" class="modal-backdrop" @click="showCatalogModal = false" @keydown.esc="showCatalogModal = false">
      <div class="modal-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title" @click.stop>
        <div class="modal-header">
          <div>
            <div class="modal-title-wrap">
              <Layers class="text-cyan" :size="20" />
              <h3 id="catalog-modal-title" class="modal-title gradient-text">{{ t('catalogTitle', { count: catalogToolCount }) }}</h3>
            </div>
            <p class="modal-sub">{{ t('catalogSub', { count: catalogToolCount, tools: toolsList.length }) }}</p>
          </div>
          <button class="cyber-close-btn" :aria-label="t('closeCatalog')" @click="showCatalogModal = false">
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
                v-for="entry in cat.tools"
                :key="entry.name"
                :class="['catalog-item-badge', isNativeTool(entry.name) ? 'native' : '']"
              >
                <span>{{ entry.name }}</span>
                <span v-if="isNativeTool(entry.name)" class="native-tag">{{ t('native') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export {
  filterCommonTools,
  getCommonToolsCount,
  normalizeAppState
} from './utils/appState.js'
</script>

<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
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
  Star,
  Layers,
  Palette,
  Braces,
  Database,
  MessageCircle,
  Download,
  Upload,
  Keyboard
} from 'lucide-vue-next'

import { toolCategories, toolsList } from './config/tools.js'
import catalogJson from '../toolhelper_directory.json'
import ToastContainer from './components/ToastContainer.vue'
import UpdateModal from './components/UpdateModal.vue'
import FeedbackModal from './components/FeedbackModal.vue'
import CommandPalette from './components/CommandPalette.vue'
import { useTheme } from './composables/useTheme.js'
import { useUpdater, openUpdatePanel } from './composables/useUpdater.js'
import { globalToast } from './composables/useToast.js'
import { resolveLocale, translate } from './i18n.js'
import {
  createWorkspaceBackup,
  filterCommonTools,
  getCommonToolsCount,
  MAX_WORKSPACE_BACKUP_BYTES,
  normalizeAppState,
  parseWorkspaceBackup,
  recordRecentTool,
  sortToolsByPreference
} from './utils/appState.js'
import { buildCommandCatalog, flattenCommandCatalog } from './utils/commandPalette.js'

// 工具组件注册表：组件与元数据的单一映射，新增工具只需在 registry.js 登记
import { toolComponents, assertToolRegistry } from './config/registry.js'

const categoryIconMap = {
  LayoutGrid,
  Sparkles,
  Binary,
  ShieldCheck,
  FileCode2,
  FileText,
  Calculator,
  Clock,
  Image,
  Palette,
  Braces,
  Database,
  Layers
}

// localStorage 持久化辅助
const STORAGE_KEY = 'geek-toolbox-state'
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      isDark: isDark.value,
      favorites: favorites.value,
      recentToolIds: recentToolIds.value,
      openTabs: openTabs.value.map(t => t.id),
      currentToolId: currentToolId.value,
      locale: localeSetting.value
    }))
  } catch {
    /* 忽略存储失败 */
  }
}

const savedState = loadState()
const appState = normalizeAppState(savedState, toolsList, Object.keys(toolComponents))
const localeSetting = ref(savedState?.locale === 'zh-CN' || savedState?.locale === 'en-US' ? savedState.locale : 'auto')
const effectiveLocale = computed(() => resolveLocale(localeSetting.value, typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language]))
const t = (key, values) => translate(effectiveLocale.value, key, values)
watch(effectiveLocale, value => { if (typeof document !== 'undefined') document.documentElement.lang = value }, { immediate: true })

// Windows 版本更新
const { state: updaterState, hasUpdate, checkForUpdates } = useUpdater()

// 状态管理
const { isDark, applyTheme, toggleTheme: switchTheme } = useTheme()
// setup 阶段即同步主题（早于首帧渲染，避免深浅色闪烁）
applyTheme(savedState && typeof savedState.isDark === 'boolean' ? savedState.isDark : true)
const mobileMenuOpen = ref(false)
const showCatalogModal = ref(false)
const feedbackOpen = ref(false)
const commandPaletteOpen = ref(false)
const shortcutsOpen = ref(false)
const shortcutsCloseButton = ref(null)
const workspaceFileInput = ref(null)
const searchQuery = ref('')
const activeCategory = ref('all')
const currentToolId = ref(appState.currentToolId)
const favorites = ref(appState.favorites)
const recentToolIds = ref(appState.recentToolIds)

// 多标签管理
const openTabs = ref(appState.openTabs)

const allCatalog = ref(catalogJson)
const catalogToolCount = computed(() => allCatalog.value.reduce((total, category) => total + category.tools.length, 0))

const commandActions = computed(() => [
  {
    id: 'toggle-theme',
    title: t('actionToggleTheme'),
    subtitle: t('actionToggleThemeDesc'),
    icon: isDark.value ? 'Sun' : 'Moon',
    keywords: ['theme', 'dark', 'light', '外观', '深色', '浅色', '主题']
  },
  {
    id: 'check-updates',
    title: t('actionCheckUpdate'),
    subtitle: t('actionCheckUpdateDesc'),
    icon: 'Sparkles',
    keywords: ['update', 'release', 'version', 'github', '更新', '版本']
  },
  {
    id: 'export-workspace',
    title: t('actionExportWorkspace'),
    subtitle: t('actionExportWorkspaceDesc'),
    icon: 'Download',
    keywords: ['export', 'backup', 'workspace', 'json', '导出', '备份']
  },
  {
    id: 'import-workspace',
    title: t('actionImportWorkspace'),
    subtitle: t('actionImportWorkspaceDesc'),
    icon: 'Upload',
    keywords: ['import', 'restore', 'workspace', 'json', '导入', '恢复']
  },
  {
    id: 'open-catalog',
    title: t('actionOpenCatalog'),
    subtitle: t('actionOpenCatalogDesc'),
    icon: 'Layers',
    keywords: ['catalog', 'directory', 'tools', '目录', '图谱']
  },
  {
    id: 'feedback',
    title: t('actionFeedback'),
    subtitle: t('actionFeedbackDesc'),
    icon: 'MessageCircle',
    keywords: ['feedback', 'community', 'qq', '反馈', '交流群']
  },
  {
    id: 'shortcuts',
    title: t('actionShortcuts'),
    subtitle: t('actionShortcutsDesc'),
    icon: 'Keyboard',
    keywords: ['keyboard', 'shortcut', 'hotkey', '快捷键', '帮助']
  }
])

const commandCatalog = computed(() => buildCommandCatalog({
  tools: toolsList,
  favorites: favorites.value,
  recentToolIds: recentToolIds.value,
  actions: commandActions.value
}))

const commandPaletteCommands = computed(() => flattenCommandCatalog(commandCatalog.value))

const commandPaletteLabels = computed(() => ({
  title: t('commandTitle'),
  placeholder: t('commandPlaceholder'),
  inputLabel: t('commandInputLabel'),
  resultLabel: t('commandResultLabel'),
  close: t('commandClose'),
  empty: t('commandEmpty'),
  navigate: t('commandNavigate'),
  select: t('commandSelect'),
  dismiss: t('commandDismiss'),
  localOnly: t('commandLocalOnly'),
  pinned: t('commandPinned'),
  recent: t('commandRecent'),
  action: t('commandAction'),
  tool: t('commandTool'),
  sections: {
    pinned: t('commandSectionPinned'),
    recent: t('commandSectionRecent'),
    actions: t('commandSectionActions'),
    tools: t('commandSectionTools'),
    results: t('commandSectionResults')
  }
}))

// 主题切换（统一走 useTheme，切换后持久化）
function toggleTheme() {
  switchTheme()
  saveState()
}

// 计算当前工具
const currentTool = computed(() => {
  return toolsList.find(t => t.id === currentToolId.value) || toolsList[0]
})

const currentToolComponent = computed(() => {
  return toolComponents[currentToolId.value]
})

// 开发期注册表一致性自检：工具元数据与组件接线一旦错位立即报错，而不是运行时打不开
if (import.meta.env.DEV) {
  try {
    assertToolRegistry()
  } catch (e) {
    console.error('[toolbox] 工具注册表自检失败：', e)
  }
}

const activeCategoryName = computed(() => {
  const c = toolCategories.find(item => item.id === activeCategory.value)
  return c ? c.name : t('all')
})

// 分类与搜索过滤
const filteredTools = computed(() => {
  if (activeCategory.value === 'common') {
    return sortToolsByPreference(
      filterCommonTools(toolsList, favorites.value, searchQuery.value),
      favorites.value,
      recentToolIds.value
    )
  }

  let list = toolsList
  if (activeCategory.value !== 'all') {
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
  if (catId === 'common') return getCommonToolsCount(toolsList, favorites.value, searchQuery.value)
  return toolsList.filter(t => t.category === catId).length
}

function getCategoryName(catId) {
  const cat = toolCategories.find(c => c.id === catId)
  return cat ? cat.name : t('tools')
}

function selectCategory(catId) {
  activeCategory.value = catId
  mobileMenuOpen.value = false
}

function rememberTool(toolId) {
  recentToolIds.value = recordRecentTool(recentToolIds.value, toolId)
}

function openTool(tool) {
  currentToolId.value = tool.id
  if (!openTabs.value.some(t => t.id === tool.id)) {
    openTabs.value.push(tool)
  }
  rememberTool(tool.id)
  mobileMenuOpen.value = false
  saveState()
}

function switchTool(toolId) {
  currentToolId.value = toolId
  rememberTool(toolId)
  saveState()
}

function closeTab(toolId) {
  if (openTabs.value.length === 1) return
  const idx = openTabs.value.findIndex(t => t.id === toolId)
  if (idx !== -1) {
    openTabs.value.splice(idx, 1)
    if (currentToolId.value === toolId) {
      currentToolId.value = openTabs.value[Math.max(0, idx - 1)].id
    }
    saveState()
    const focusToolId = currentToolId.value
    nextTick(() => {
      document.querySelector(`[data-tab-id="${CSS.escape(focusToolId)}"]`)?.focus()
    })
  }
}

function toggleFavorite(id) {
  const idx = favorites.value.indexOf(id)
  if (idx > -1) {
    favorites.value.splice(idx, 1)
  } else {
    favorites.value.push(id)
  }
  saveState()
}

function isFavorite(id) {
  return favorites.value.includes(id)
}

function exportWorkspace() {
  const payload = JSON.stringify(createWorkspaceBackup({
    isDark: isDark.value,
    favorites: favorites.value,
    recentToolIds: recentToolIds.value,
    openTabs: openTabs.value,
    currentToolId: currentToolId.value
  }), null, 2)
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `geek-toolbox-workspace-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  globalToast(t('backupExported'))
}

async function handleWorkspaceImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > MAX_WORKSPACE_BACKUP_BYTES) {
    globalToast(t('backupTooLarge'), 'error')
    return
  }
  try {
    const imported = parseWorkspaceBackup(await file.text(), toolsList, Object.keys(toolComponents))
    favorites.value = imported.favorites
    recentToolIds.value = imported.recentToolIds
    openTabs.value = imported.openTabs
    currentToolId.value = imported.currentToolId
    applyTheme(imported.isDark)
    saveState()
    globalToast(t('backupRestored'))
  } catch (error) {
    globalToast(error instanceof Error ? error.message : t('backupUnreadable'), 'error')
  }
}

function isNativeTool(name) {
  return toolsList.some(tool => tool.name === name)
}

function openCommandPalette() {
  mobileMenuOpen.value = false
  commandPaletteOpen.value = true
}

function closeCommandPalette() {
  commandPaletteOpen.value = false
}

function closeShortcuts() {
  shortcutsOpen.value = false
}

function trapShortcutsFocus(event) {
  event.preventDefault()
  shortcutsCloseButton.value?.focus()
}

async function openShortcuts() {
  commandPaletteOpen.value = false
  await nextTick()
  shortcutsOpen.value = true
}

let shortcutsRestoreFocus = null
watch(shortcutsOpen, async open => {
  if (open) {
    shortcutsRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    shortcutsCloseButton.value?.focus()
  } else if (shortcutsRestoreFocus?.isConnected) {
    const target = shortcutsRestoreFocus
    shortcutsRestoreFocus = null
    await nextTick()
    target.focus()
  }
})

async function executeCommand(command) {
  if (!command) return
  commandPaletteOpen.value = false
  if (command.type === 'tool') {
    const tool = toolsList.find(item => item.id === command.toolId)
    if (tool) openTool(tool)
    return
  }

  await nextTick()
  switch (command.actionId) {
    case 'toggle-theme':
      toggleTheme()
      break
    case 'check-updates':
      await checkForUpdates({ manual: true })
      break
    case 'export-workspace':
      exportWorkspace()
      break
    case 'import-workspace':
      workspaceFileInput.value?.click()
      break
    case 'open-catalog':
      showCatalogModal.value = true
      break
    case 'feedback':
      feedbackOpen.value = true
      break
    case 'shortcuts':
      await openShortcuts()
      break
  }
}

function isEditableTarget(target) {
  return target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
}

function handleKeydown(e) {
  const moduleKey = e.ctrlKey || e.metaKey
  if (moduleKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (commandPaletteOpen.value) closeCommandPalette()
    else openCommandPalette()
    return
  }
  if (moduleKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
    e.preventDefault()
    toggleTheme()
    return
  }
  if (e.key === 'Escape' && shortcutsOpen.value) {
    e.preventDefault()
    closeShortcuts()
    return
  }
  if (e.key === '?' && !moduleKey && !e.altKey && !isEditableTarget(e.target)) {
    e.preventDefault()
    openShortcuts()
  }
}

function handleTabKeydown(event, tabId) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    switchTool(tabId)
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const index = openTabs.value.findIndex(tab => tab.id === tabId)
  if (index < 0 || openTabs.value.length < 2) return
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (index + direction + openTabs.value.length) % openTabs.value.length
  const nextTab = openTabs.value[nextIndex]
  switchTool(nextTab.id)
  nextTick(() => {
    document.querySelector(`[data-tab-id="${CSS.escape(nextTab.id)}"]`)?.focus()
  })
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  // 启动后静默检查更新，发现新版本时自动弹窗（桌面版主进程也会主动推送）
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.locale-picker select { max-width: 118px; min-height: 28px; border: 1px solid var(--border-color, #3a5166); border-radius: 4px; background: var(--bg-card, #111b27); color: inherit; padding: 2px 6px; font-size: 11px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
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
  background: linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 50%, var(--accent-purple) 100%);
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
  color: var(--accent-amber);
}

/* 窄窗口顶部标题栏 */
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
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem 1.15rem;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(180deg, rgba(var(--rgb-primary), 0.05) 0%, transparent 100%);
}
.brand-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.brand-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}
.cyber-logo-box {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 0.5rem;
  background: rgba(var(--rgb-primary), 0.12);
  border: 1px solid rgba(var(--rgb-primary), 0.3);
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
  white-space: nowrap;
}
.brand-title {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.version-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.65rem;
  font-weight: 700;
  font-family: var(--font-mono);
  padding: 0.1rem 0.35rem;
  background: rgba(var(--rgb-purple), 0.15);
  border: 1px solid rgba(var(--rgb-purple), 0.3);
  color: var(--accent-purple);
  border-radius: 4px;
  cursor: pointer;
  line-height: 1.5;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}
.version-chip:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--rgb-purple), 0.6);
  box-shadow: 0 0 10px rgba(var(--rgb-purple), 0.28);
}
.version-chip:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}
.version-chip.has-update {
  color: var(--accent-green);
  border-color: rgba(var(--rgb-green), 0.5);
  background: rgba(var(--rgb-green), 0.12);
}
.update-ping {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
  animation: update-blink 1.4s ease-in-out infinite;
}
@keyframes update-blink {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.75); }
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
  box-shadow: 0 0 12px rgba(var(--rgb-primary), 0.25);
}
.cyber-kbd {
  position: absolute;
  right: 0.6rem;
  font-size: 0.65rem;
  font-family: var(--font-mono);
  line-height: 1.4;
  background: rgba(var(--rgb-primary), 0.1);
  border: 1px solid rgba(var(--rgb-primary), 0.25);
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  color: var(--accent-cyan);
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}
.cyber-kbd:hover,
.cyber-kbd:focus-visible {
  background: rgba(var(--rgb-primary), 0.16);
  border-color: rgba(var(--rgb-primary), 0.5);
  box-shadow: 0 0 10px rgba(var(--rgb-primary), 0.18);
  outline: none;
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
  border-color: rgba(var(--rgb-primary), 0.15);
}
.cat-item:hover .cat-icon {
  color: var(--primary);
}
.cat-item.active {
  background: linear-gradient(90deg, rgba(var(--rgb-primary), 0.15) 0%, rgba(var(--rgb-cyan), 0.05) 100%);
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-primary), 0.3);
  font-weight: 600;
  box-shadow: 0 0 15px rgba(var(--rgb-primary), 0.1);
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
  background: rgba(var(--rgb-primary), 0.2);
  color: var(--accent-cyan);
}

/* 侧边栏底部 HUD 监控台 */
.sidebar-footer {
  padding: 1rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: linear-gradient(0deg, rgba(var(--rgb-primary), 0.05) 0%, transparent 100%);
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
.workspace-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.workspace-action {
  min-width: 0;
  justify-content: center;
  padding-inline: 0.5rem;
}
.workspace-action span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hidden-file-input {
  display: none;
}

/* 交流群入口按钮（侧边栏底部，常驻可见） */
.community-btn {
  width: 100%;
  position: relative;
  border-color: rgba(18, 183, 245, 0.35);
  background: linear-gradient(135deg, rgba(18, 183, 245, 0.12) 0%, rgba(var(--rgb-cyan), 0.05) 100%);
  color: var(--text-main);
}
.community-btn:hover {
  border-color: rgba(18, 183, 245, 0.7);
  color: #12b7f5;
  box-shadow: 0 0 14px rgba(18, 183, 245, 0.22);
}
.community-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #12b7f5;
  box-shadow: 0 0 8px #12b7f5;
  animation: community-pulse 2s infinite;
}
@keyframes community-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

/* 窄窗口顶栏右侧按钮组 */
.mobile-header-right {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* 工具头部操作区 */
.tool-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
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
  border-color: rgba(var(--rgb-primary), 0.35);
  font-weight: 600;
  box-shadow: 0 0 15px rgba(var(--rgb-primary), 0.15);
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
  background: rgba(var(--rgb-green), 0.1);
  border: 1px solid rgba(var(--rgb-green), 0.25);
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
  color: var(--text-main);
  text-align: left;
  font: inherit;
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
  box-shadow: 0 0 20px rgba(var(--rgb-primary), 0.2);
}
.mini-tool-card:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 3px; }
.empty-search { color: var(--text-muted); }
.empty-search p { margin-bottom: 0.75rem; }
.mini-tool-card.current {
  border-color: var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.08);
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
  background: rgba(var(--rgb-red), 0.12);
  border: 1px solid rgba(var(--rgb-red), 0.3);
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
  border: 1px solid rgba(var(--rgb-primary), 0.3);
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
  border-color: rgba(var(--rgb-green), 0.4);
  background: rgba(var(--rgb-green), 0.08);
  color: var(--accent-green);
  box-shadow: 0 0 10px rgba(var(--rgb-green), 0.1);
}
.native-tag {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--accent-green);
}
.shortcuts-card {
  max-width: 620px;
}
.shortcuts-body {
  gap: 0.55rem;
}
.shortcut-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: var(--surface-inset);
  color: var(--text-muted);
  font-size: 0.82rem;
}
.shortcut-row > span {
  min-width: 0;
}
.shortcut-row kbd {
  min-width: 24px;
  padding: 0.14rem 0.4rem;
  border: 1px solid var(--border-color);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-main);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  text-align: center;
}
.shortcuts-hint {
  margin-top: 0.45rem;
  padding: 0.75rem 0.85rem;
  border-left: 2px solid var(--accent-cyan);
  background: rgba(var(--rgb-primary), 0.06);
  color: var(--text-sub);
  font-size: 0.78rem;
  line-height: 1.65;
}

/* 响应式媒体查询（窄窗口适配） */
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
  .shortcut-row {
    grid-template-columns: minmax(0, 1fr) auto auto auto;
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
    color: var(--on-accent);
    border-color: var(--accent-cyan);
    box-shadow: 0 0 10px rgba(var(--rgb-primary), 0.3);
  }
}
@media (min-width: 769px) {
  .mobile-only {
    display: none !important;
  }
}
</style>
