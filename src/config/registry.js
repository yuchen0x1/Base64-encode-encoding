/**
 * 工具注册表（单一事实来源）
 *
 * 将「工具元数据 (tools.js)」与「组件实现 (.vue)」的映射集中到一处，
 * 消除原先散落在 App.vue 中的 hand-maintained `toolComponentsMap` 所带来的
 * 重复维护与错位风险：新增/改名工具时，只要这一处与 tools.js 不一致，
 * 开发期 `assertToolRegistry()` 就会立即抛错，而不是在运行时静默打不开工具。
 */
import { defineAsyncComponent } from 'vue'
import { toolCategories, toolsList } from './tools.js'
import ToolLoading from '../components/ToolLoading.vue'
import ToolLoadError from '../components/ToolLoadError.vue'

/**
 * 工具 id -> 动态加载器。Vite 会把每个工具拆成独立 chunk，首屏不再加载
 * 全部 21 个工具；命令面板/标签切换时才载入对应模块。
 */
export const toolComponentLoaders = {
  'batch-processor': () => import('../components/tools/ToolBatch.vue'),
  base64: () => import('../components/tools/ToolBase64.vue'),
  'jwt-decoder': () => import('../components/tools/ToolJwt.vue'),
  'unicode-codec': () => import('../components/tools/ToolUnicode.vue'),
  'cipher-toolbox': () => import('../components/tools/ToolCipher.vue'),
  'image-base64': () => import('../components/tools/ToolImageBase64.vue'),
  'url-codec': () => import('../components/tools/ToolUrl.vue'),
  'json-format': () => import('../components/tools/ToolJson.vue'),
  'hash-crypto': () => import('../components/tools/ToolHash.vue'),
  timestamp: () => import('../components/tools/ToolTimestamp.vue'),
  'qrcode-generator': () => import('../components/tools/ToolQrcode.vue'),
  'radix-convert': () => import('../components/tools/ToolRadix.vue'),
  'text-diff': () => import('../components/tools/ToolDiff.vue'),
  'regex-tester': () => import('../components/tools/ToolRegex.vue'),
  'random-password': () => import('../components/tools/ToolPassword.vue'),
  'aes-crypto': () => import('../components/tools/ToolAes.vue'),
  'text-toolbox': () => import('../components/tools/ToolTextTools.vue'),
  'jwt-generator': () => import('../components/tools/ToolJwtGenerator.vue'),
  'color-converter': () => import('../components/tools/ToolColor.vue'),
  'escape-toolbox': () => import('../components/tools/ToolEscape.vue'),
  'sql-formatter': () => import('../components/tools/ToolSql.vue')
}

function lazyTool(loader) {
  return defineAsyncComponent({
    loader,
    loadingComponent: ToolLoading,
    errorComponent: ToolLoadError,
    delay: 120,
    timeout: 15000
  })
}

/** id -> 异步组件实现（shape 与原静态映射保持兼容） */
export const toolComponents = Object.fromEntries(
  Object.entries(toolComponentLoaders).map(([id, loader]) => [id, lazyTool(loader)])
)

/**
 * 交叉校验 toolsList 元数据与 toolComponents 实现是否一一对应。
 * 用于开发期启动自检；不一致时抛出可读错误，避免工具「注册了却打不开」。
 * @returns {true} 一致
 * @throws {Error} 存在未接线或孤儿组件
 */
const TOOL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REQUIRED_TOOL_FIELDS = ['id', 'name', 'category', 'description', 'tags', 'icon', 'isCommon']

/**
 * 收集工具注册表的结构与连线错误。
 * 允许传入 fixture，便于测试坏数据而不污染生产注册表。
 */
export function getToolRegistryErrors({
  metadata = toolsList,
  components = toolComponents,
  categories = toolCategories
} = {}) {
  const errors = []
  const registeredIds = new Set(Object.keys(components))
  const metaIds = new Set()
  const categoryIds = new Set(categories.map((category) => category.id))

  categories.forEach((category, index) => {
    if (!category || typeof category.id !== 'string' || !category.id.trim()) {
      errors.push(`分类 #${index + 1} 缺少有效 id`)
    }
    if (!category || typeof category.name !== 'string' || !category.name.trim()) {
      errors.push(`分类 "${category?.id ?? `#${index + 1}`}" 缺少有效 name`)
    }
    if (!category || typeof category.icon !== 'string' || !category.icon.trim()) {
      errors.push(`分类 "${category?.id ?? `#${index + 1}`}" 缺少有效 icon`)
    }
  })

  metadata.forEach((tool, index) => {
    const label = tool?.id || `#${index + 1}`
    if (!tool || typeof tool !== 'object') {
      errors.push(`工具 ${label} 不是对象`)
      return
    }
    for (const field of REQUIRED_TOOL_FIELDS) {
      const value = tool[field]
      const missing = value === undefined || value === null || (typeof value === 'string' && !value.trim())
      if (missing) {
        errors.push(`工具 "${label}" 缺少有效字段 ${field}`)
      }
    }
    if (typeof tool.id === 'string' && !TOOL_ID_PATTERN.test(tool.id)) {
      errors.push(`工具 "${label}" 的 id 必须使用 kebab-case`)
    }
    if (metaIds.has(tool.id)) {
      errors.push(`工具 "${label}" 的 id 重复`)
    }
    metaIds.add(tool.id)
    if (typeof tool.category === 'string' && !categoryIds.has(tool.category)) {
      errors.push(`工具 "${label}" 使用了未登记分类 "${tool.category}"`)
    }
    if (!Array.isArray(tool.tags) || tool.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
      errors.push(`工具 "${label}" 的 tags 必须是非空字符串数组`)
    }
    if (typeof tool.isCommon !== 'boolean') {
      errors.push(`工具 "${label}" 的 isCommon 必须是布尔值`)
    }
  })

  for (const tool of metadata) {
    if (!tool || typeof tool !== 'object') continue
    if (!registeredIds.has(tool.id)) {
      errors.push(`工具 "${tool.id}" (${tool.name}) 已在 toolsList 登记，但缺少对应的组件实现`)
    }
  }
  for (const id of registeredIds) {
    if (!metaIds.has(id)) {
      errors.push(`组件 "${id}" 已注册，但在 toolsList 中找不到元数据（可能是多余的或遗漏登记）`)
    }
  }

  return errors
}

/**
 * 交叉校验 toolsList 元数据与 toolComponents 实现是否一一对应。
 * 用于开发期启动自检和 CI；不一致时抛出可读错误。
 * @returns {true} 一致
 * @throws {Error} 存在 schema、未接线或孤儿组件
 */
export function assertToolRegistry(options) {
  const errors = getToolRegistryErrors(options)
  if (errors.length) {
    throw new Error('工具注册表不一致：\n- ' + errors.join('\n- '))
  }
  return true
}
