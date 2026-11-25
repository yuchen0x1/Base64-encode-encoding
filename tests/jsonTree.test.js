import { describe, expect, it } from 'vitest'
import { buildJsonTreeRows, JSON_TREE_MAX_VISIBLE_NODES } from '../src/utils/jsonTree.js'

describe('JSON tree projection', () => {
  it('preserves default expansion and JSON paths', () => {
    const tree = buildJsonTreeRows({
      items: [{ 'a.b': 1 }, { value: true }]
    }, { defaultExpandDepth: 3 })

    expect(tree.rows.map(row => row.path)).toEqual([
      '$',
      '$.items',
      '$.items[0]',
      '$.items[0]["a.b"]',
      '$.items[1]',
      '$.items[1].value'
    ])
    expect(tree.rows.find(row => row.path === '$.items[0]').expanded).toBe(true)
    expect(tree.truncated).toBe(false)
  })

  it('applies manual expansion overrides', () => {
    const expandedOverrides = new Map([['$.nested', true]])
    const tree = buildJsonTreeRows({ nested: { value: 1 } }, {
      defaultExpandDepth: 1,
      expandedOverrides
    })

    expect(tree.rows.map(row => row.path)).toEqual(['$', '$.nested', '$.nested.value'])
  })

  it('caps wide nested arrays across the entire rendered tree', () => {
    const wideObject = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`key${index}`, index])
    )
    const root = Array.from({ length: 500 }, () => wideObject)
    const tree = buildJsonTreeRows(root, { defaultExpandDepth: 2 })

    expect(tree.rows).toHaveLength(JSON_TREE_MAX_VISIBLE_NODES)
    expect(tree.truncated).toBe(true)
  })
})
