import { describe, expect, it } from 'vitest'
import {
  formatJson,
  generateTypeScript,
  parseJson,
  removeEmptyJsonValues,
  sortJsonObjectKeys,
  unescapeJsonString
} from '../src/components/tools/jsonTool.js'

describe('JSON tool helpers', () => {
  it('formats a legal null root value and accepts it as JSON', () => {
    expect(formatJson('null')).toEqual({ ok: true, value: 'null' })
    expect(JSON.stringify(removeEmptyJsonValues(null), null, 2)).toBe('null')
  })

  it('distinguishes parse errors from legal root null', () => {
    expect(parseJson('null')).toEqual({ ok: true, value: null })
    expect(formatJson('{')).toMatchObject({ ok: false })
    expect(removeEmptyJsonValues(null)).toBeNull()
  })

  it('preserves __proto__ keys without mutating output prototypes', () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":true},"safe":1}')
    const sorted = sortJsonObjectKeys(parsed)
    const cleaned = removeEmptyJsonValues(parsed)

    for (const result of [sorted, cleaned]) {
      expect(Object.getPrototypeOf(result)).toBeNull()
      expect(Object.hasOwn(result, '__proto__')).toBe(true)
      expect(result.__proto__).toEqual({ polluted: true })
    }
    expect({}.polluted).toBeUndefined()
    expect(JSON.parse(JSON.stringify(sorted))).toEqual(parsed)
    expect(JSON.parse(JSON.stringify(cleaned))).toEqual(parsed)
  })

  it('rejects non-string JSON values when unescaping and leaves their input intact', () => {
    for (const text of ['{}', 'null', '0', 'true']) {
      const result = unescapeJsonString(text)
      expect(result.ok).toBe(false)
      expect(result.error).toBeInstanceOf(TypeError)
      expect(text).toBe(JSON.stringify(JSON.parse(text)))
    }
    expect(unescapeJsonString('"{\\"ok\\":true}"')).toEqual({
      ok: true,
      value: '{"ok":true}'
    })
    expect(unescapeJsonString('{').ok).toBe(false)
  })

  it('avoids fixed RootData alias and normalized-name collisions in generated types', () => {
    const types = generateTypeScript(JSON.parse('{"Data":{"id":1},"RootData":{"value":true}}'))
    expect(types.match(/export interface RootDataType \{/g)).toHaveLength(1)
    expect(types).toContain('export type RootData = Root')
    expect(types).toContain('Data: RootDataType;')
    expect(types).toContain('RootData: RootRootDataType;')
  })

  it('quotes property names that are not valid TypeScript identifiers', () => {
    const types = generateTypeScript(JSON.parse('{"a-b":1,"a_b":"x","default":true}'))
    expect(types).toContain('"a-b": number;')
    expect(types).toContain('a_b: string;')
    expect(types).toContain('"default": boolean;')
  })

  it('merges repeated array-object shapes into one TypeScript interface', () => {
    const types = generateTypeScript(JSON.parse('[{"id":1,"label":"first"},{"id":2,"label":"second"}]'))
    expect(types.match(/export interface RootItem \{/g)).toHaveLength(1)
    expect(types).toContain('export type RootData = RootItem[]')
    expect(types).toContain('id: number;')
    expect(types).toContain('label: string;')
  })
})
