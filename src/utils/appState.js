export const WORKSPACE_BACKUP_APP = 'geek-toolbox'
export const WORKSPACE_BACKUP_SCHEMA = 1
export const MAX_WORKSPACE_BACKUP_BYTES = 1 * 1024 * 1024
export const MAX_RECENT_TOOLS = 8

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
  const recentToolIds = normalizeIds(savedState?.recentToolIds).slice(0, MAX_RECENT_TOOLS)
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
    recentToolIds,
    openTabs: tabIds.map(id => toolById.get(id)),
    currentToolId
  }
}

/** 记录最近使用工具；同一工具只保留最新位置，并限制条目数。 */
export function recordRecentTool(recentToolIds, toolId, limit = MAX_RECENT_TOOLS) {
  if (typeof toolId !== 'string' || !toolId || limit <= 0) return []
  const source = Array.isArray(recentToolIds) ? recentToolIds : []
  return [toolId, ...source.filter(id => typeof id === 'string' && id !== toolId)]
    .slice(0, limit)
}

/** 收藏优先、最近使用其次，其余保持调用方原有顺序。 */
export function sortToolsByPreference(tools, favoriteIds = [], recentToolIds = []) {
  const favoriteOrder = new Map(
    (Array.isArray(favoriteIds) ? favoriteIds : []).map((id, index) => [id, index])
  )
  const recent = new Map((Array.isArray(recentToolIds) ? recentToolIds : [])
    .map((id, index) => [id, index]))
  return tools
    .map((tool, index) => ({ tool, index }))
    .sort((left, right) => {
      const leftFavorite = favoriteOrder.get(left.tool.id) ?? Number.MAX_SAFE_INTEGER
      const rightFavorite = favoriteOrder.get(right.tool.id) ?? Number.MAX_SAFE_INTEGER
      if (leftFavorite !== rightFavorite) return leftFavorite - rightFavorite
      const leftRecent = recent.get(left.tool.id) ?? Number.MAX_SAFE_INTEGER
      const rightRecent = recent.get(right.tool.id) ?? Number.MAX_SAFE_INTEGER
      if (leftRecent !== rightRecent) return leftRecent - rightRecent
      return left.index - right.index
    })
    .map(({ tool }) => tool)
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
      recentToolIds: Array.isArray(state?.recentToolIds) ? [...state.recentToolIds].slice(0, MAX_RECENT_TOOLS) : [],
      openTabs: Array.isArray(state?.openTabs)
        ? state.openTabs.map(tool => typeof tool === 'string' ? tool : tool?.id).filter(Boolean)
        : [],
      currentToolId: typeof state?.currentToolId === 'string' ? state.currentToolId : null
    }
  }
}

export function parseWorkspaceBackup(raw, tools, registeredToolIds) {
  if (typeof raw === 'string' && new TextEncoder().encode(raw).byteLength > MAX_WORKSPACE_BACKUP_BYTES) {
    throw new Error('工作区备份超过 1 MiB 大小上限')
  }

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
