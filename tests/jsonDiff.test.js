import { describe, expect, it } from 'vitest'
import { diffJson } from '../src/utils/jsonDiff.js'
import {
  JSON_ADVANCED_MAX_BYTES,
  assertJsonDocumentSize,
  formatJsonError,
  jsonByteLength
} from '../src/components/tools/jsonTool.js'

describe('structured JSON diff', () => {
  it('ignores object key order but reports added, removed and changed values', () => {
    const left = { b: 2, a: { keep: true, change: 1, remove: 'x' } }
    const right = { a: { keep: true, change: 2, add: 'y' }, b: 2 }
    const result = diffJson(left, right)

    expect(result).toMatchObject({
      ok: true,
      equal: false,
      counts: { added: 1, removed: 1, changed: 1 }
    })
    expect(result.changes).toEqual(expect.arrayContaining([
      { type: 'added', path: '$.a.add', after: 'y' },
      { type: 'removed', path: '$.a.remove', before: 'x' },
      { type: 'changed', path: '$.a.change', before: 1, after: 2 }
    ]))
    expect(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toMatchObject({ ok: true, equal: true, changes: [] })
  })

  it('compares arrays by index and handles root type changes', () => {
    expect(diffJson([1, 2], [1, 3, 4])).toMatchObject({
      ok: true,
      counts: { added: 1, removed: 0, changed: 1 }
    })
    expect(diffJson({}, [])).toMatchObject({
      ok: true,
      changes: [{ type: 'changed', path: '$', before: {}, after: [] }]
    })
  })

  it('escapes non-identifier keys and preserves unsafe keys without prototype pollution', () => {
    const left = JSON.parse('{"a.b":1,"__proto__":{"safe":true}}')
    const right = JSON.parse('{"a.b":2,"__proto__":{"safe":false}}')
    const result = diffJson(left, right)

    expect(result.changes.map(change => change.path)).toEqual(expect.arrayContaining([
      '$["a.b"]',
      '$.__proto__.safe'
    ]))
    expect({}.safe).toBeUndefined()
  })

  it('returns a bounded error instead of exhausting the renderer', () => {
    const large = Array.from({ length: 20 }, (_, index) => ({ index, nested: { value: index } }))
    expect(diffJson(large, large.map(item => ({ ...item, nested: { value: item.index + 1 } })), { maxChanges: 5 }))
      .toMatchObject({ ok: false })
    expect(diffJson(large, structuredClone(large), { maxNodes: 3 })).toMatchObject({ ok: false })
  })

  it('locates malformed JSON and enforces the advanced document size boundary', () => {
    expect(formatJsonError('{', new SyntaxError('Unexpected end of JSON input'))).toContain('第 1 行')
    expect(jsonByteLength('中文 🚀')).toBe(new TextEncoder().encode('中文 🚀').byteLength)
    expect(() => assertJsonDocumentSize('{"a":"'.concat('x'.repeat(17 * 1024 * 1024), '"}'))).toThrow(/16 MiB/)
    expect(assertJsonDocumentSize('{"ok":true}')).toBe(11)
    expect(JSON_ADVANCED_MAX_BYTES).toBe(16 * 1024 * 1024)
  })
})
