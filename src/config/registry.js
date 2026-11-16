/**
 * 工具注册表（单一事实来源）
 *
 * 将「工具元数据 (tools.js)」与「组件实现 (.vue)」的映射集中到一处，
 * 消除原先散落在 App.vue 中的 hand-maintained `toolComponentsMap` 所带来的
 * 重复维护与错位风险：新增/改名工具时，只要这一处与 tools.js 不一致，
 * 开发期 `assertToolRegistry()` 就会立即抛错，而不是在运行时静默打不开工具。
 */
import { toolCategories, toolsList } from './tools.js'

import ToolBatch from '../components/tools/ToolBatch.vue'
import ToolBase64 from '../components/tools/ToolBase64.vue'
import ToolJwt from '../components/tools/ToolJwt.vue'
import ToolUnicode from '../components/tools/ToolUnicode.vue'
import ToolCipher from '../components/tools/ToolCipher.vue'
import ToolImageBase64 from '../components/tools/ToolImageBase64.vue'
import ToolUrl from '../components/tools/ToolUrl.vue'
import ToolJson from '../components/tools/ToolJson.vue'
import ToolHash from '../components/tools/ToolHash.vue'
import ToolTimestamp from '../components/tools/ToolTimestamp.vue'
import ToolQrcode from '../components/tools/ToolQrcode.vue'
import ToolRadix from '../components/tools/ToolRadix.vue'
import ToolDiff from '../components/tools/ToolDiff.vue'
import ToolRegex from '../components/tools/ToolRegex.vue'
import ToolPassword from '../components/tools/ToolPassword.vue'
import ToolAes from '../components/tools/ToolAes.vue'
import ToolTextTools from '../components/tools/ToolTextTools.vue'
import ToolJwtGenerator from '../components/tools/ToolJwtGenerator.vue'
import ToolColor from '../components/tools/ToolColor.vue'
import ToolEscape from '../components/tools/ToolEscape.vue'
import ToolSql from '../components/tools/ToolSql.vue'

/** id -> 组件实现 */
export const toolComponents = {
  'batch-processor': ToolBatch,
  'base64': ToolBase64,
  'jwt-decoder': ToolJwt,
  'unicode-codec': ToolUnicode,
  'cipher-toolbox': ToolCipher,
  'image-base64': ToolImageBase64,
  'url-codec': ToolUrl,
  'json-format': ToolJson,
  'hash-crypto': ToolHash,
  'timestamp': ToolTimestamp,
  'qrcode-generator': ToolQrcode,
  'radix-convert': ToolRadix,
  'text-diff': ToolDiff,
  'regex-tester': ToolRegex,
  'random-password': ToolPassword,
  'aes-crypto': ToolAes,
  'text-toolbox': ToolTextTools,
  'jwt-generator': ToolJwtGenerator,
  'color-converter': ToolColor,
  'escape-toolbox': ToolEscape,
  'sql-formatter': ToolSql
}

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
