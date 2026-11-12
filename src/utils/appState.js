export const WORKSPACE_BACKUP_APP = 'geek-toolbox'
export const WORKSPACE_BACKUP_SCHEMA = 1

export const DEFAULT_FAVORITE_IDS = ['base64', 'json-format', 'timestamp', 'url-codec', 'radix-convert']
export const DEFAULT_OPEN_TAB_IDS = ['base64', 'json-format', 'timestamp', 'radix-convert']

/** 将持久化数据规范化为有效且互相一致的应用状态。 */
export function normalizeAppState(savedState, tools, registeredToolIds) {
  const registeredIds = new Set(registeredToolIds)
  const validTools = tools.filter(tool => tool && registeredIds.has(tool.id))
  const validIds = new Set(validTools.map(tool => tool.id))
  const toolById = new Map(validTools.map(tool => [tool.id, tool]))
  const normalizeIds = ids => {
    if (!Array.isArray(ids)) return []
    const seen = new Set()
    return ids.filter(id => {
      if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  // 空数组代表用户主动清空收藏；标签页至少保留一个可用工具。
  const favorites = Array.isArray(savedState?.favorites)
    ? normalizeIds(savedState.favorites)
    : normalizeIds(DEFAULT_FAVORITE_IDS)
  let tabIds = normalizeIds(savedState?.openTabs)
  if (tabIds.length === 0) tabIds = normalizeIds(DEFAULT_OPEN_TAB_IDS)

  let currentToolId = validIds.has(savedState?.currentToolId) ? savedState.currentToolId : null
  if (currentToolId) {
    if (!tabIds.includes(currentToolId)) tabIds.push(currentToolId)
  } else {
    currentToolId = tabIds[0] || validTools[0]?.id || null
    if (currentToolId && !tabIds.includes(currentToolId)) tabIds.push(currentToolId)
  }

  return {
    favorites,
    openTabs: tabIds.map(id => toolById.get(id)),
    currentToolId
  }
}

/** 常用工具 = 内置常用 ∪ 用户收藏，搜索与展示使用同一结果集。 */
export function filterCommonTools(tools, favoriteIds, searchQuery = '') {
  const favorites = new Set(Array.isArray(favoriteIds) ? favoriteIds : [])
  const query = typeof searchQuery === 'string' ? searchQuery.trim().toLowerCase() : ''
  return tools.filter(tool => {
    if (!tool.isCommon && !favorites.has(tool.id)) return false
    if (!query) return true
    return tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query) ||
      tool.tags.some(tag => tag.toLowerCase().includes(query))
  })
}

export function getCommonToolsCount(tools, favoriteIds, searchQuery = '') {
  return filterCommonTools(tools, favoriteIds, searchQuery).length
}

export function createWorkspaceBackup(state, exportedAt = new Date()) {
  return {
    app: WORKSPACE_BACKUP_APP,
    schemaVersion: WORKSPACE_BACKUP_SCHEMA,
    exportedAt: exportedAt.toISOString(),
    state: {
      isDark: Boolean(state?.isDark),
      favorites: Array.isArray(state?.favorites) ? [...state.favorites] : [],
      openTabs: Array.isArray(state?.openTabs)
        ? state.openTabs.map(tool => typeof tool === 'string' ? tool : tool?.id).filter(Boolean)
        : [],
      currentToolId: typeof state?.currentToolId === 'string' ? state.currentToolId : null
    }
  }
}

export function parseWorkspaceBackup(raw, tools, registeredToolIds) {
  let parsed
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    throw new Error('工作区备份不是有效的 JSON 文件')
  }

  if (!parsed || parsed.app !== WORKSPACE_BACKUP_APP || parsed.schemaVersion !== WORKSPACE_BACKUP_SCHEMA) {
    throw new Error('工作区备份版本不受支持')
  }

  const source = parsed.state
  if (!source || typeof source !== 'object') throw new Error('工作区备份缺少 state 数据')
  const normalized = normalizeAppState(source, tools, registeredToolIds)
  return {
    ...normalized,
    isDark: typeof source.isDark === 'boolean' ? source.isDark : true
  }
}
