import { formatJsonPathPart } from './jsonPath.js'

export const JSON_TREE_MAX_VISIBLE_NODES = 1000

export function buildJsonTreeRows(root, {
  rootLabel = '$',
  rootPath = '$',
  rootDepth = 0,
  defaultExpandDepth = 1,
  expandedOverrides = new Map(),
  maxNodes = JSON_TREE_MAX_VISIBLE_NODES
} = {}) {
  const rows = []
  let truncated = false
  const limit = Math.max(1, maxNodes)

  function visit(node, label, path, depth) {
    if (rows.length >= limit) {
      truncated = true
      return
    }

    const isArray = Array.isArray(node)
    const isObject = node !== null && typeof node === 'object' && !isArray
    const isContainer = isArray || isObject
    const expanded = isContainer && (expandedOverrides.has(path)
      ? expandedOverrides.get(path)
      : depth < defaultExpandDepth)
    rows.push({ node, label, path, depth, isArray, isObject, isContainer, expanded })

    if (!expanded) return
    if (isArray) {
      for (let index = 0; index < node.length; index++) {
        if (rows.length >= limit) {
          truncated = true
          break
        }
        visit(node[index], `[${index}]`, `${path}[${index}]`, depth + 1)
      }
      return
    }

    for (const key in node) {
      if (!Object.hasOwn(node, key)) continue
      if (rows.length >= limit) {
        truncated = true
        break
      }
      visit(node[key], key, `${path}${formatJsonPathPart(key)}`, depth + 1)
    }
  }

  visit(root, rootLabel, rootPath, rootDepth)
  return { rows, truncated }
}
