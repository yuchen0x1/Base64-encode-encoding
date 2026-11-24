const TOOL_ALIASES = Object.freeze({
  'batch-processor': 'batch bulk pipeline recipe queue file 批量 配方 队列',
  base64: 'base64 encode decode encoder decoder 编码 解码',
  'jwt-decoder': 'jwt token decode decoder auth claims verify 令牌 鉴权 验签',
  'unicode-codec': 'unicode html entity entities escape 编码 字符实体',
  'cipher-toolbox': 'hex base32 morse rot13 caesar cipher 密码 进制',
  'image-base64': 'image picture dataurl base64 media 图片 媒体',
  'url-codec': 'url uri encode decode percent 网址 编码',
  'json-format': 'json format formatter minify validate tree path diff 格式化 校验',
  'hash-crypto': 'hash md5 sha sha1 sha256 sha512 hmac digest 摘要 哈希',
  'aes-crypto': 'aes encrypt decrypt cipher crypto symmetric 对称加密',
  timestamp: 'timestamp unix epoch time date 时间戳 日期',
  'regex-tester': 'regex regexp pattern match test 正则 匹配',
  'text-diff': 'diff compare text code 对比 差异',
  'radix-convert': 'radix base binary octal decimal hexadecimal 进制 二进制',
  'qrcode-generator': 'qr qrcode barcode scan decode generate 二维码 识别',
  'random-password': 'password random uuid guid secret 随机 密码',
  'text-toolbox': 'text count unique deduplicate lines 文本 统计 去重',
  'jwt-generator': 'jwt token generate sign hs256 令牌 签名',
  'color-converter': 'color colour hex rgb rgba hsl hsv css contrast 颜色 转换',
  'escape-toolbox': 'escape unescape unicode hex c string 转义',
  'sql-formatter': 'sql format formatter minify query database 数据库 格式化'
})

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().trim()
}

function toolCommand(tool, overrides = {}) {
  const aliases = TOOL_ALIASES[tool.id] || ''
  const keywords = [
    tool.id,
    tool.name,
    tool.description,
    ...(Array.isArray(tool.tags) ? tool.tags : []),
    aliases
  ]
  return {
    id: `tool:${tool.id}`,
    type: 'tool',
    tool,
    toolId: tool.id,
    title: tool.name,
    subtitle: tool.description,
    icon: tool.icon,
    keywords: keywords.join(' '),
    pinned: false,
    recentIndex: Number.MAX_SAFE_INTEGER,
    sectionKey: 'tools',
    ...overrides
  }
}

/**
 * 生成工具箱命令目录：收藏置顶 → 最近使用 → 快捷操作 → 其余工具。
 * 不改变原始 tools 数组或标签页顺序。
 */
export function buildCommandCatalog({
  tools = [],
  favorites = [],
  recentToolIds = [],
  actions = []
} = {}) {
  const byId = new Map(tools.map(tool => [tool.id, tool]))
  const favoriteOrder = new Map(
    (Array.isArray(favorites) ? favorites : []).map((id, index) => [id, index])
  )
  const recentOrder = new Map(
    (Array.isArray(recentToolIds) ? recentToolIds : []).map((id, index) => [id, index])
  )
  const order = new Map(tools.map((tool, index) => [tool.id, index]))
  const pinned = (Array.isArray(favorites) ? favorites : [])
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(tool => toolCommand(tool, {
      pinned: true,
      sectionKey: 'pinned',
      favoriteIndex: favoriteOrder.get(tool.id) ?? 0
    }))
  const pinnedIds = new Set(pinned.map(command => command.toolId))
  const recent = (Array.isArray(recentToolIds) ? recentToolIds : [])
    .map(id => byId.get(id))
    .filter(tool => tool && !pinnedIds.has(tool.id))
    .map(tool => toolCommand(tool, {
      sectionKey: 'recent',
      recentIndex: recentOrder.get(tool.id) ?? 0
    }))
  const recentIds = new Set(recent.map(command => command.toolId))
  const actionCommands = actions.map((action, index) => ({
    id: `action:${action.id}`,
    type: 'action',
    actionId: action.id,
    title: action.title,
    subtitle: action.subtitle || '',
    icon: action.icon || 'Zap',
    keywords: [action.id, action.title, action.subtitle, ...(action.keywords || [])].join(' '),
    sectionKey: 'actions',
    order: index,
    pinned: false,
    recentIndex: Number.MAX_SAFE_INTEGER
  }))
  const remaining = tools
    .filter(tool => !favoriteOrder.has(tool.id) && !recentIds.has(tool.id))
    .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
    .map(tool => toolCommand(tool))

  return { pinned, recent, actions: actionCommands, tools: remaining }
}

export function flattenCommandCatalog(catalog) {
  return [
    ...(catalog?.pinned || []),
    ...(catalog?.recent || []),
    ...(catalog?.actions || []),
    ...(catalog?.tools || [])
  ]
}

function scoreText(text, query) {
  if (!text || !query) return 0
  if (text === query) return 100
  if (text.startsWith(query)) return 78
  const boundary = text.split(/[\s,;/|._:-]+/).some(token => token.startsWith(query))
  if (boundary) return 64
  if (text.includes(query)) return 46
  return 0
}

export function scoreCommand(command, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return 0
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const title = normalizeSearchText(command.title)
  const subtitle = normalizeSearchText(command.subtitle)
  const keywords = normalizeSearchText(command.keywords)
  let total = 0
  for (const token of tokens) {
    const tokenScore = Math.max(
      scoreText(title, token) * 3,
      scoreText(keywords, token) * 2,
      scoreText(subtitle, token)
    )
    if (!tokenScore) return 0
    total += tokenScore
  }
  if (command.pinned) total += 8
  if (Number.isFinite(command.recentIndex) && command.recentIndex < Number.MAX_SAFE_INTEGER) total += 4
  return total
}

/** 搜索并按相关度排序；空查询保持目录分组顺序。 */
export function filterCommands(commands, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return commands.map(command => ({ ...command, sectionKey: command.sectionKey }))
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(command, normalizedQuery) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ command, score }) => ({ ...command, sectionKey: 'results', score }))
}

export function moveCommandIndex(index, delta, length) {
  if (!Number.isInteger(length) || length <= 0) return -1
  if (!Number.isInteger(index) || index < 0) return delta > 0 ? 0 : length - 1
  return (index + delta + length) % length
}

export function commandOptionId(commandId) {
  return `command-option-${String(commandId || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export { normalizeSearchText, TOOL_ALIASES }
