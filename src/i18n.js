export const LOCALES = ['zh-CN', 'en-US']

export function resolveLocale(setting, candidates = []) {
  if (setting === 'zh-CN' || setting === 'en-US') return setting
  for (const candidate of (candidates.length ? candidates : ['zh-CN'])) {
    const value = String(candidate).toLowerCase()
    if (value === 'en' || value.startsWith('en-')) return 'en-US'
    if (value === 'zh' || value.startsWith('zh-')) return 'zh-CN'
  }
  return 'zh-CN'
}

export function localeLabel(locale) {
  return locale === 'en-US' ? 'English' : '简体中文'
}

const catalogs = {
  'zh-CN': {
    brand: '极客工具箱', updateAvailable: '发现新版本', checkUpdate: '点击检查更新', closeMenu: '关闭工具菜单', openMenu: '打开工具菜单',
    lightTheme: '切换浅色模式', darkTheme: '切换深色模式', feedback: '反馈 / 加入交流群',
    searchPlaceholder: '呼出命令检索 (Ctrl+K)...', searchAria: '搜索工具', modules: '模块控制台 / MODULES',
    localTools: '本地工具', computeLocation: '计算位置', noUpload: '工具输入', catalog: '{count} 款全量全景图谱',
    community: '反馈 & 交流群', exportWorkspace: '导出工作区', importWorkspace: '导入工作区',
    workspaceAria: '工作区备份', exportTitle: '导出收藏、标签页和主题设置', importTitle: '从 JSON 文件恢复工作区',
    chooseBackup: '选择工作区备份文件', openTools: '已打开工具', offlineReady: 'OFFLINE READY',
    localCompute: '零网络请求 · 本地内存计算', feedbackShort: '反馈', favorite: '常用置顶', favoriteAdded: '已加常用',
    notFound: '该功能正在接入中，已规划在全量离线工具库内。', quickNav: '同分类极速导航 ({category})',
    availableCount: '共 {count} 款即时可用', open: '打开', noMatches: '未找到匹配的工具，请调整关键词或分类。',
    reset: '重置筛选', catalogTitle: '{count} 款全量工具矩阵图谱 (TOOLHELPER.CN)',
    catalogSub: '目录收录 {count} 项；本项目实际内置 {tools} 款可用工具，其余为目录索引',
    closeCatalog: '关闭工具目录', native: '● 项目内置', language: '语言 / Language', auto: '自动 / Auto', close: '关闭', all: '全部', tools: '工具', backupExported: '工作区备份已导出', backupTooLarge: '工作区备份超过 1 MiB 大小上限，未读取文件', backupRestored: '工作区已恢复', backupUnreadable: '工作区备份无法读取'
  },
  'en-US': {
    brand: 'Geek Toolbox', updateAvailable: 'New version available', checkUpdate: 'Check for updates', closeMenu: 'Close tool menu', openMenu: 'Open tool menu',
    lightTheme: 'Switch to light mode', darkTheme: 'Switch to dark mode', feedback: 'Feedback / Community',
    searchPlaceholder: 'Search tools (Ctrl+K)...', searchAria: 'Search tools', modules: 'MODULES',
    localTools: 'Local tools', computeLocation: 'Compute locally', noUpload: 'No upload', catalog: '{count} tools in catalog',
    community: 'Feedback & Community', exportWorkspace: 'Export workspace', importWorkspace: 'Import workspace',
    workspaceAria: 'Workspace backup', exportTitle: 'Export favorites, tabs, and theme', importTitle: 'Restore workspace from JSON',
    chooseBackup: 'Choose workspace backup file', openTools: 'Open tools', offlineReady: 'OFFLINE READY',
    localCompute: 'No network requests · In-memory computation', feedbackShort: 'Feedback', favorite: 'Pin favorite', favoriteAdded: 'Pinned',
    notFound: 'This feature is being connected and is planned for the full offline tool library.', quickNav: 'Quick navigation ({category})',
    availableCount: '{count} tools available', open: 'Open', noMatches: 'No matching tools. Adjust your search or category.',
    reset: 'Reset filters', catalogTitle: '{count} tools catalog (TOOLHELPER.CN)',
    catalogSub: '{count} catalog entries; {tools} tools are built into this project, the rest are index entries',
    closeCatalog: 'Close tool catalog', native: '● Built in', language: 'Language / 语言', auto: 'Auto / 自动', close: 'Close', all: 'All', tools: 'Tools', backupExported: 'Workspace backup exported', backupTooLarge: 'Workspace backup exceeds the 1 MiB limit and was not read', backupRestored: 'Workspace restored', backupUnreadable: 'Workspace backup could not be read'
  }
}

export function translate(locale, key, values = {}) {
  let value = catalogs[locale]?.[key] ?? catalogs['zh-CN'][key] ?? key
  return value.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))
}
