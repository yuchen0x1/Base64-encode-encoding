import { describe, it, expect } from 'vitest'
import { getToolRegistryErrors, toolComponents, toolComponentLoaders, assertToolRegistry } from '../src/config/registry.js'
import { toolsList } from '../src/config/tools.js'

describe('tool registry', () => {
  it('every metadata tool has a wired component', () => {
    for (const tool of toolsList) {
      expect(toolComponents[tool.id], `missing component for ${tool.id}`).toBeTruthy()
    }
  })
  it('no orphan components beyond registered metadata', () => {
    const metaIds = new Set(toolsList.map((t) => t.id))
    for (const id of Object.keys(toolComponents)) {
      expect(metaIds.has(id), `orphan component ${id}`).toBe(true)
    }
  })
  it('assertToolRegistry passes', () => {
    expect(assertToolRegistry()).toBe(true)
    expect(getToolRegistryErrors()).toEqual([])
  })

  it('rejects malformed metadata before it can reach the UI', () => {
    const errors = getToolRegistryErrors({
      metadata: [{
        id: 'Bad ID',
        name: '',
        category: 'missing-category',
        description: 'bad',
        tags: ['ok', ''],
        icon: 'Tool',
        isCommon: 'yes'
      }],
      components: { 'Bad ID': {} },
      categories: [{ id: 'all', name: '全部工具', icon: 'LayoutGrid' }]
    })

    expect(errors).toEqual(expect.arrayContaining([
      '工具 "Bad ID" 缺少有效字段 name',
      '工具 "Bad ID" 的 id 必须使用 kebab-case',
      '工具 "Bad ID" 使用了未登记分类 "missing-category"',
      '工具 "Bad ID" 的 tags 必须是非空字符串数组',
      '工具 "Bad ID" 的 isCommon 必须是布尔值'
    ]))
    expect(() => assertToolRegistry({
      metadata: [{ id: 'duplicate', name: 'A', category: 'all', description: 'A', tags: ['a'], icon: 'A', isCommon: false },
        { id: 'duplicate', name: 'B', category: 'all', description: 'B', tags: ['b'], icon: 'B', isCommon: false }],
      components: { duplicate: {} },
      categories: [{ id: 'all', name: '全部工具', icon: 'LayoutGrid' }]
    })).toThrow(/id 重复/)
  })
  it('registers the expected number of tools', () => {
    expect(Object.keys(toolComponents).length).toBe(21)
  })

  it('keeps every tool component lazy-loadable and wired to a module', async () => {
    expect(Object.keys(toolComponentLoaders)).toHaveLength(21)
    for (const [id, loader] of Object.entries(toolComponentLoaders)) {
      expect(typeof loader, `loader for ${id}`).toBe('function')
      const module = await loader()
      expect(module.default, `default export for ${id}`).toBeTruthy()
    }
  })
})
