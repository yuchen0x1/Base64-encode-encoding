/**
 * 工具注册表（单一事实来源）
 *
 * 将「工具元数据 (tools.js)」与「组件实现 (.vue)」的映射集中到一处，
 * 消除原先散落在 App.vue 中的 hand-maintained `toolComponentsMap` 所带来的
 * 重复维护与错位风险：新增/改名工具时，只要这一处与 tools.js 不一致，
 * 开发期 `assertToolRegistry()` 就会立即抛错，而不是在运行时静默打不开工具。
 */
import { toolsList } from './tools.js'

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
export function assertToolRegistry() {
  const errors = []
  const registeredIds = new Set(Object.keys(toolComponents))
  const metaIds = new Set(toolsList.map((t) => t.id))

  for (const tool of toolsList) {
    if (!registeredIds.has(tool.id)) {
      errors.push(`工具 "${tool.id}" (${tool.name}) 已在 toolsList 登记，但缺少对应的组件实现`)
    }
  }
  for (const id of registeredIds) {
    if (!metaIds.has(id)) {
      errors.push(`组件 "${id}" 已注册，但在 toolsList 中找不到元数据（可能是多余的或遗漏登记）`)
    }
  }

  if (errors.length) {
    throw new Error('工具注册表不一致：\n- ' + errors.join('\n- '))
  }
  return true
}
