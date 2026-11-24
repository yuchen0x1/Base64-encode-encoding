import { describe, expect, it } from 'vitest'
import { formatJsonPath, queryJsonPath } from '../src/utils/jsonPath.js'

const document = {
  user: {
    name: '张三',
    roles: ['admin', 'editor'],
    profile: { city: '上海', emoji: '🚀' }
  },
  items: [
    { id: 1, name: 'first' },
    { id: 2, name: 'second' },
    { id: 3, name: 'third' }
  ],
  'a.b': [{ deep: true }],
  nested: { user: { name: '李四' } }
}

describe('JSONPath subset', () => {
  it('reads root, dotted properties, bracket keys, indexes and negative indexes', () => {
    expect(queryJsonPath(document, '$').results[0].path).toBe('$')
    expect(queryJsonPath(document, '$.user.name').results[0].value).toBe('张三')
    expect(queryJsonPath(document, "$['a.b'][0].deep").results[0].value).toBe(true)
    expect(queryJsonPath(document, '$.items[1].id').results[0].value).toBe(2)
    expect(queryJsonPath(document, '$.items[-1].id').results[0].value).toBe(3)
    expect(queryJsonPath(document, '$.user.profile.emoji').results[0].value).toBe('🚀')
  })

  it('supports wildcards, slices and recursive descent without mutating input', () => {
    expect(queryJsonPath(document, '$.items[*].name').results.map(result => result.value)).toEqual(['first', 'second', 'third'])
    expect(queryJsonPath(document, '$.items[0:2].id').results.map(result => result.value)).toEqual([1, 2])
    expect(queryJsonPath(document, '$.items[::-1].id').results.map(result => result.value)).toEqual([3, 2, 1])
    expect(queryJsonPath(document, '$..name').results.map(result => result.value)).toEqual(['张三', 'first', 'second', 'third', '李四'])
    expect(queryJsonPath(document, '$.user.*').results.map(result => result.path)).toEqual([
      '$.user.name', '$.user.roles', '$.user.profile'
    ])
    expect(document).toEqual(expect.objectContaining({ user: expect.any(Object) }))
  })

  it('formats quoted paths for keys that are not identifiers', () => {
    expect(formatJsonPath([{ key: 'a.b' }, { type: 'index', index: 0 }])).toBe('$["a.b"][0]')
    expect(queryJsonPath(document, "$['a.b'][0].deep").results[0].path).toBe('$["a.b"][0].deep')
    expect(queryJsonPath(document, '$..missing')).toMatchObject({ ok: true, count: 0, results: [] })
  })

  it('fails explicitly for invalid syntax, zero step, oversized paths and result limits', () => {
    for (const path of ['', 'user.name', '$.', '$[', '$.items[abc]', '$.items[::0]', '$.items]']) {
      const result = queryJsonPath(document, path)
      expect(result.ok, path).toBe(false)
      expect(result.error).toBeTruthy()
    }
    expect(queryJsonPath(document, '$' + '.a'.repeat(1100)).ok).toBe(false)
    expect(queryJsonPath(document, '$.items[*]', { maxResults: 2 })).toMatchObject({ ok: false })
  })

  it('does not treat inherited properties as matches', () => {
    const value = JSON.parse('{"__proto__":{"polluted":true},"safe":1}')
    expect(queryJsonPath(value, '$.__proto__.polluted').results[0].value).toBe(true)
    expect(queryJsonPath(value, '$.constructor')).toMatchObject({ ok: true, count: 0 })
    expect({}.polluted).toBeUndefined()
  })
})
