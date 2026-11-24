import { formatJsonPathPart } from './jsonPath.js'

const DEFAULT_MAX_CHANGES = 5000
const DEFAULT_MAX_NODES = 50000
const MAX_DEPTH = 256

function pathFor(base, segment, type) {
  return `${base}${type === 'index' ? `[${segment}]` : formatJsonPathPart(segment)}`
}

function kindOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function addChange(state, change) {
  state.changes.push(change)
  state.counts[change.type] += 1
  if (state.changes.length > state.maxChanges) {
    throw new Error(`差异超过 ${state.maxChanges} 项，请缩小比较范围`)
  }
}

function compare(left, right, path, depth, state) {
  state.nodes += 1
  if (state.nodes > state.maxNodes) {
    throw new Error(`差异比较超过 ${state.maxNodes} 个节点，请缩小比较范围`)
  }
  if (depth > MAX_DEPTH) throw new Error(`JSON 嵌套超过 ${MAX_DEPTH} 层，无法安全比较`)

  if (Object.is(left, right)) return
  const leftKind = kindOf(left)
  const rightKind = kindOf(right)
  if (leftKind !== rightKind || leftKind !== 'object' && leftKind !== 'array') {
    addChange(state, { type: 'changed', path, before: left, after: right })
    return
  }

  if (leftKind === 'array') {
    const shared = Math.min(left.length, right.length)
    for (let index = 0; index < shared; index += 1) {
      compare(left[index], right[index], pathFor(path, index, 'index'), depth + 1, state)
    }
    for (let index = shared; index < left.length; index += 1) {
      addChange(state, { type: 'removed', path: pathFor(path, index, 'index'), before: left[index] })
    }
    for (let index = shared; index < right.length; index += 1) {
      addChange(state, { type: 'added', path: pathFor(path, index, 'index'), after: right[index] })
    }
    return
  }

  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    const nextPath = pathFor(path, key, 'key')
    const inLeft = Object.hasOwn(left, key)
    const inRight = Object.hasOwn(right, key)
    if (!inLeft) addChange(state, { type: 'added', path: nextPath, after: right[key] })
    else if (!inRight) addChange(state, { type: 'removed', path: nextPath, before: left[key] })
    else compare(left[key], right[key], nextPath, depth + 1, state)
  }
}

/**
 * 结构化比较两个已解析的 JSON 值。对象键顺序不会产生差异；
 * 数组顺序是数据语义的一部分，因此按下标比较。
 */
export function diffJson(left, right, {
  maxChanges = DEFAULT_MAX_CHANGES,
  maxNodes = DEFAULT_MAX_NODES
} = {}) {
  try {
    if (!Number.isSafeInteger(maxChanges) || maxChanges < 1) throw new Error('maxChanges 必须是正整数')
    if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new Error('maxNodes 必须是正整数')
    const state = {
      changes: [],
      counts: { added: 0, removed: 0, changed: 0 },
      nodes: 0,
      maxChanges,
      maxNodes
    }
    compare(left, right, '$', 0, state)
    return {
      ok: true,
      equal: state.changes.length === 0,
      changes: state.changes,
      counts: state.counts,
      nodesCompared: state.nodes
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message || 'JSON 差异比较失败'
    }
  }
}
