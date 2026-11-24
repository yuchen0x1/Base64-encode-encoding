const MAX_PATH_LENGTH = 2048
const DEFAULT_MAX_RESULTS = 1000
const MAX_VISITED_NODES = 100000
const IDENTIFIER_PATTERN = /^[\p{L}_$][\p{L}\p{N}_$]*$/u

class JsonPathError extends Error {}

export function formatJsonPathPart(key) {
  if (IDENTIFIER_PATTERN.test(key)) return `.${key}`
  return `[${JSON.stringify(key)}]`
}

export function formatJsonPath(parts) {
  return '$' + parts.map(part => (
    part.type === 'index' ? `[${part.index}]` : formatJsonPathPart(part.key)
  )).join('')
}

function normalizeIndex(index, length) {
  return index < 0 ? length + index : index
}

function parseQuotedKey(expression, start) {
  const quote = expression[start]
  let index = start + 1
  let escaped = false
  for (; index < expression.length; index += 1) {
    const char = expression[index]
    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (char === quote) {
      break
    }
  }
  if (index >= expression.length) throw new JsonPathError('JSONPath 字符串键缺少结束引号')
  let key
  try {
    if (quote === '"') {
      key = JSON.parse(expression.slice(start, index + 1))
    } else {
      const raw = expression.slice(start + 1, index)
      let jsonLiteral = '"'
      for (let offset = 0; offset < raw.length; offset += 1) {
        const char = raw[offset]
        if (char === '"') {
          jsonLiteral += '\\"'
        } else if (char !== '\\') {
          jsonLiteral += char
          continue
        } else {
          const next = raw[offset + 1]
          if (next === '\'') {
            jsonLiteral += '\''
            offset += 1
          } else if (next === '"') {
            jsonLiteral += '\\"'
            offset += 1
          } else if ('\\/bfnrt'.includes(next)) {
            jsonLiteral += `\\${next}`
            offset += 1
          } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(offset + 2, offset + 6))) {
            jsonLiteral += raw.slice(offset, offset + 6)
            offset += 5
          } else {
            throw new JsonPathError('JSONPath 字符串键包含无效转义')
          }
        }
      }
      key = JSON.parse(`${jsonLiteral}"`)
    }
  } catch {
    throw new JsonPathError('JSONPath 字符串键包含无效转义')
  }
  return { key, next: index + 1 }
}

function skipWhitespace(expression, index) {
  while (index < expression.length && /\s/.test(expression[index])) index += 1
  return index
}

export function parseJsonPath(expression) {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new JsonPathError('请输入 JSONPath 表达式，例如 $.items[*].name')
  }
  const source = expression.trim()
  if (source.length > MAX_PATH_LENGTH) {
    throw new JsonPathError(`JSONPath 不能超过 ${MAX_PATH_LENGTH} 个字符`)
  }
  if (source[0] !== '$') throw new JsonPathError('JSONPath 必须以 $ 开头')

  const steps = []
  let index = 1
  while (index < source.length) {
    if (source.startsWith('..', index)) {
      index += 2
      if (source[index] === '*') {
        steps.push({ type: 'recursive-wildcard' })
        index += 1
        continue
      }
      const start = index
      while (index < source.length && source[index] !== '.' && source[index] !== '[' && source[index] !== ']') index += 1
      const key = source.slice(start, index)
      if (!key) throw new JsonPathError('JSONPath 递归下降缺少键名')
      steps.push({ type: 'recursive-key', key })
      continue
    }

    if (source[index] === '.') {
      index += 1
      const start = index
      while (index < source.length && source[index] !== '.' && source[index] !== '[' && source[index] !== ']') index += 1
      const key = source.slice(start, index)
      if (!key) throw new JsonPathError('JSONPath 点号后缺少键名')
      steps.push(key === '*' ? { type: 'wildcard' } : { type: 'key', key })
      continue
    }

    if (source[index] === '[') {
      const open = index
      index = skipWhitespace(source, index + 1)
      if (source[index] === '\'' || source[index] === '"') {
        const parsed = parseQuotedKey(source, index)
        index = skipWhitespace(source, parsed.next)
        if (source[index] !== ']') throw new JsonPathError('JSONPath 字符串键后缺少 ]')
        steps.push({ type: 'key', key: parsed.key })
        index += 1
        continue
      }

      const close = source.indexOf(']', index)
      if (close < 0) throw new JsonPathError('JSONPath 方括号缺少 ]')
      const content = source.slice(index, close).trim()
      if (!content) throw new JsonPathError('JSONPath 方括号内容不能为空')
      if (content === '*') {
        steps.push({ type: 'wildcard' })
      } else if (/^-?\d+$/.test(content)) {
        const value = Number(content)
        if (!Number.isSafeInteger(value)) throw new JsonPathError('JSONPath 数组索引超出安全整数范围')
        steps.push({ type: 'index', index: value })
      } else {
        const slice = /^(-?\d*):(-?\d*)(?::(-?\d*))?$/.exec(content)
        if (!slice || slice[3] === '0') {
          throw new JsonPathError(`不支持的 JSONPath 方括号语法：[${content}]`)
        }
        const toIndex = value => value === '' || value === undefined ? undefined : Number(value)
        steps.push({
          type: 'slice',
          start: toIndex(slice[1]),
          end: toIndex(slice[2]),
          step: toIndex(slice[3])
        })
      }
      index = skipWhitespace(source, close + 1)
      if (source[open] !== '[') throw new JsonPathError('JSONPath 方括号解析失败')
      continue
    }

    if (source[index] === ']') throw new JsonPathError('JSONPath 出现未匹配的 ]')
    throw new JsonPathError(`JSONPath 在位置 ${index + 1} 遇到无法解析的字符`)
  }
  return steps
}

function isContainer(value) {
  return value !== null && typeof value === 'object'
}

function collectRecursive(value, parts, key, results, state, depth = 0) {
  if (!isContainer(value)) return
  if (depth > 256) throw new JsonPathError('JSONPath 递归超过 256 层，请缩小查询范围')
  state.visited += 1
  if (state.visited > MAX_VISITED_NODES) throw new JsonPathError('JSONPath 遍历节点超过 100000 个，请缩小查询范围')

  if (key !== '*' && !Array.isArray(value) && Object.hasOwn(value, key)) {
    results.push({ value: value[key], parts: [...parts, { key }] })
  }
  if (results.length > state.maxResults) {
    throw new JsonPathError(`JSONPath 结果超过 ${state.maxResults} 条，请缩小查询范围`)
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const childParts = [...parts, { type: 'index', index }]
      if (key === '*') results.push({ value: value[index], parts: childParts })
      collectRecursive(value[index], childParts, key, results, state, depth + 1)
    }
  } else {
    for (const childKey of Object.keys(value)) {
      const childParts = [...parts, { key: childKey }]
      if (key === '*') results.push({ value: value[childKey], parts: childParts })
      collectRecursive(value[childKey], childParts, key, results, state, depth + 1)
    }
  }
}

function applyStep(nodes, step, state) {
  const next = []
  const push = (value, parts) => {
    next.push({ value, parts })
    if (next.length > state.maxResults) {
      throw new JsonPathError(`JSONPath 结果超过 ${state.maxResults} 条，请缩小查询范围`)
    }
  }

  for (const node of nodes) {
    const value = node.value
    if (step.type === 'key') {
      if (isContainer(value) && !Array.isArray(value) && Object.hasOwn(value, step.key)) {
        push(value[step.key], [...node.parts, { key: step.key }])
      }
    } else if (step.type === 'index') {
      if (Array.isArray(value)) {
        const index = normalizeIndex(step.index, value.length)
        if (index >= 0 && index < value.length) push(value[index], [...node.parts, { type: 'index', index }])
      }
    } else if (step.type === 'wildcard') {
      if (Array.isArray(value)) {
        value.forEach((child, index) => push(child, [...node.parts, { type: 'index', index }]))
      } else if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) push(value[key], [...node.parts, { key }])
      }
    } else if (step.type === 'slice') {
      if (Array.isArray(value)) {
        const length = value.length
        const stepValue = step.step ?? 1
        if (stepValue > 0) {
          let start = step.start ?? 0
          let end = step.end ?? length
          if (start < 0) start = Math.max(0, length + start)
          if (end < 0) end = Math.max(0, length + end)
          for (let index = Math.min(start, length); index < Math.min(end, length); index += stepValue) {
            push(value[index], [...node.parts, { type: 'index', index }])
          }
        } else {
          let start = step.start ?? length - 1
          let end = step.end
          if (start < 0) start = length + start
          if (end !== undefined && end < 0) end = length + end
          const lowerBound = end === undefined ? -1 : end
          for (let index = Math.min(start, length - 1); index > lowerBound && index >= 0; index += stepValue) {
            push(value[index], [...node.parts, { type: 'index', index }])
          }
        }
      }
    } else if (step.type === 'recursive-key' || step.type === 'recursive-wildcard') {
      const startedAt = next.length
      collectRecursive(value, node.parts, step.type === 'recursive-wildcard' ? '*' : step.key, next, state)
      if (next.length > state.maxResults || next.length < startedAt) {
        throw new JsonPathError(`JSONPath 结果超过 ${state.maxResults} 条，请缩小查询范围`)
      }
    }
  }
  return next
}

/**
 * 支持一个刻意保持小巧、可审计的 JSONPath 子集：
 * $、.key、['key']、[0]、[*]、负索引、切片 [start:end:step]、递归 ..key / ..*。
 * 不执行任意脚本，不修改输入对象。
 */
export function queryJsonPath(root, expression, { maxResults = DEFAULT_MAX_RESULTS } = {}) {
  try {
    const steps = parseJsonPath(expression)
    if (!Number.isSafeInteger(maxResults) || maxResults < 1 || maxResults > 10000) {
      throw new JsonPathError('maxResults 必须是 1–10000 之间的整数')
    }
    let nodes = [{ value: root, parts: [] }]
    const state = { visited: 0, maxResults }
    for (const step of steps) {
      nodes = applyStep(nodes, step, state)
      if (!nodes.length) break
    }
    return {
      ok: true,
      expression,
      results: nodes.map(node => ({ path: formatJsonPath(node.parts), value: node.value })),
      count: nodes.length
    }
  } catch (error) {
    return {
      ok: false,
      expression,
      error: error instanceof JsonPathError ? error.message : `JSONPath 查询失败：${error.message}`
    }
  }
}
