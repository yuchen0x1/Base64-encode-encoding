import { describe, it, expect } from 'vitest'
import { toolComponents, assertToolRegistry } from '../src/config/registry.js'
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
  })
  it('registers the expected number of tools', () => {
    expect(Object.keys(toolComponents).length).toBe(21)
  })
})
