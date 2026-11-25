import { describe, expect, it } from 'vitest'
import { runJsonWorkerTask } from '../src/utils/jsonWorkerTasks.js'

describe('JSON worker tasks', () => {
  it('analyzes JSON documents of at least 5 MiB without losing stats', () => {
    const text = `{"items":[${'0,'.repeat(2_800_000)}0]}`
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(5 * 1024 * 1024)

    expect(runJsonWorkerTask('analyze', { text })).toEqual({ ok: true, keys: 2_800_002 })
  }, 20000)

  it('counts nested object keys without counting inherited properties', () => {
    expect(runJsonWorkerTask('analyze', {
      text: '{"items":[0,{"id":1,"nested":{"ok":true}}],"__proto__":{"safe":true}}'
    })).toEqual({ ok: true, keys: 8 })
  })

  it('formats and minifies large documents without changing their JSON value', () => {
    const text = `{"payload":"${'x'.repeat(5 * 1024 * 1024)}","id":9223372036854775807}`
    const formatted = runJsonWorkerTask('format', { text })
    const minified = runJsonWorkerTask('minify', { text: formatted.value })

    expect(formatted.ok).toBe(true)
    expect(minified).toEqual({ ok: true, value: text })
    expect(JSON.parse(formatted.value)).toEqual(JSON.parse(text))
  }, 20000)

  it('formats and minifies a 5 MiB token-heavy document without changing its tokens', () => {
    const text = `[${'0,'.repeat(2_800_000)}0]`
    expect(new TextEncoder().encode(text).byteLength).toBeGreaterThan(5 * 1024 * 1024)

    const formatted = runJsonWorkerTask('format', { text })
    expect(formatted).toMatchObject({ ok: false, error: expect.stringContaining('100,000') })
    expect(runJsonWorkerTask('minify', { text })).toEqual({ ok: true, value: text })
  }, 20000)

  it('runs structural operations and reports parse errors with a field label', () => {
    expect(runJsonWorkerTask('sort', { text: '{"z":1,"a":2}' }))
      .toMatchObject({ ok: true, value: '{\n  "a": 2,\n  "z": 1\n}' })
    expect(runJsonWorkerTask('diff', { leftText: '{', rightText: '{}' }))
      .toMatchObject({ ok: false, side: 'left' })
    expect(runJsonWorkerTask('path', { text: '{"items":[{"id":1}]}', expression: '$.items[*].id' }))
      .toMatchObject({ ok: true, value: { ok: true, count: 1 } })
  })
})
