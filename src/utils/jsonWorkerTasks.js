import {
  countJsonKeys,
  formatJson,
  JSON_FORMAT_MAX_LINES,
  generateTypeScript,
  minifyJson,
  parseJson,
  parseJsonForMutation,
  removeEmptyJsonValues,
  sortJsonObjectKeys
} from '../components/tools/jsonTool.js'
import { diffJson } from './jsonDiff.js'
import { queryJsonPath } from './jsonPath.js'

export function runJsonWorkerTask(type, payload = {}) {
  try {
    if (type === 'analyze') {
      const parsed = parseJson(payload.text)
      return parsed.ok
        ? { ok: true, keys: countJsonKeys(parsed.value) }
        : { ok: false, error: parsed.error.message || 'JSON 解析失败' }
    }

    if (type === 'format' || type === 'minify') {
      const result = type === 'format'
        ? formatJson(payload.text, { maxLines: JSON_FORMAT_MAX_LINES })
        : minifyJson(payload.text)
      return result.ok ? result : { ok: false, error: result.error.message || 'JSON 格式无效' }
    }

    if (type === 'structure') {
      const parsed = parseJsonForMutation(payload.text)
      return parsed.ok
        ? { ok: true, value: parsed.value }
        : { ok: false, error: parsed.error.message || 'JSON 结构无效' }
    }

    if (type === 'diff') {
      const left = parseJsonForMutation(payload.leftText)
      if (!left.ok) return { ok: false, side: 'left', error: left.error.message || '原始 JSON 无效' }
      const right = parseJsonForMutation(payload.rightText)
      if (!right.ok) return { ok: false, side: 'right', error: right.error.message || '对比 JSON 无效' }
      return { ok: true, value: diffJson(left.value, right.value) }
    }

    if (type === 'path') {
      const parsed = parseJsonForMutation(payload.text)
      if (!parsed.ok) return { ok: false, error: parsed.error.message || 'JSON 结构无效' }
      return { ok: true, value: queryJsonPath(parsed.value, payload.expression) }
    }

    const parsed = parseJsonForMutation(payload.text)
    if (!parsed.ok) return { ok: false, error: parsed.error.message || 'JSON 解析失败' }
    if (type === 'sort') return { ok: true, value: JSON.stringify(sortJsonObjectKeys(parsed.value), null, 2) }
    if (type === 'remove-empty') return { ok: true, value: JSON.stringify(removeEmptyJsonValues(parsed.value), null, 2) }
    if (type === 'typescript') return { ok: true, value: generateTypeScript(parsed.value) }
    return { ok: false, error: '不支持的 JSON 后台操作' }
  } catch (error) {
    return { ok: false, error: error?.message || 'JSON 后台处理失败' }
  }
}
