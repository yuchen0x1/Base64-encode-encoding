import { describe, expect, it } from 'vitest'
import { formatJsonText, assertJsonNumbersRoundTrip } from '../src/utils/jsonText.js'
import { formatJson, minifyJson, parseJsonForMutation } from '../src/components/tools/jsonTool.js'
import { createBatchRecipe, executeBatchRecipe } from '../src/utils/batchProcessing.js'

describe('lossless JSON text operations', () => {
  const input = '{ "id": 9223372036854775807, "decimal": 0.1234567890123456789, "huge": 1e999, "tiny": 1e-999, "zero": -0 }'
  const compact = '{"id":9223372036854775807,"decimal":0.1234567890123456789,"huge":1e999,"tiny":1e-999,"zero":-0}'

  it('preserves original number tokens through formatting and minification', () => {
    expect(formatJsonText(input, false)).toBe(compact)
    expect(minifyJson(formatJson(input).value)).toEqual({ ok: true, value: compact })
    expect(formatJsonText(input)).toContain('"id": 9223372036854775807')
  })

  it.each(['json-format', 'json-minify'])('preserves numbers in batch %s', operation => {
    const result = executeBatchRecipe(input, createBatchRecipe([operation]))
    expect(formatJsonText(result, false)).toBe(compact)
  })

  it('preserves strings, escaped punctuation, duplicate keys and numeric key order', () => {
    const source = String.raw`{ "2": "{}[],: \"", "1": "\u4f60", "same": 1, "same": 2, "empty": [{},[]] }`
    const expected = String.raw`{"2":"{}[],: \"","1":"\u4f60","same":1,"same":2,"empty":[{},[]]}`
    expect(formatJsonText(source, false)).toBe(expected)
    expect(formatJsonText(formatJsonText(source), false)).toBe(expected)
    expect(JSON.parse(formatJsonText(source))).toEqual(JSON.parse(source))
  })

  it.each(['null', 'true', 'false', '123', '-0', '"line\\n🚀"', '{}', '[]'])('accepts root %s', source => {
    expect(formatJsonText(source, false)).toBe(source)
    expect(formatJsonText(formatJsonText(source), false)).toBe(source)
  })

  it.each(['', '[1,]', '{"a":}', '01', 'NaN', 'true false'])('still rejects invalid JSON %j', source => {
    expect(() => formatJsonText(source)).toThrow()
    expect(formatJson(source).ok).toBe(false)
    expect(minifyJson(source).ok).toBe(false)
  })

  it.each(['9223372036854775807', '0.1234567890123456789', '1e999', '1e-999', '-0'])('blocks destructive structural changes to %s', value => {
    const result = parseJsonForMutation(`{"value":${value}}`)
    expect(result.ok).toBe(false)
    expect(result.error.message).toContain('无法无损')
  })

  it.each(['1.2300', '1e3', '9007199254740992', '0.1', '0.000', '12E-2'])('allows round-trippable numbers %s', value => {
    expect(() => assertJsonNumbersRoundTrip(`{"value":${value},"id":"9223372036854775807"}`)).not.toThrow()
    expect(parseJsonForMutation(`{"value":${value}}`).ok).toBe(true)
  })

  it('accepts BOM and avoids unbounded pretty-print expansion on deeply nested data', () => {
    expect(formatJsonText('\uFEFF{"ok":true}', false)).toBe('{"ok":true}')
    const deep = '['.repeat(1000) + '0' + ']'.repeat(1000)
    expect(formatJsonText(deep, false)).toBe(deep)
    expect(() => formatJsonText(deep)).toThrow('256')
    expect(parseJsonForMutation(deep).ok).toBe(false)
  })

  it('blocks duplicate keys, including escaped aliases, before destructive transformations', () => {
    for (const text of ['{"a":1,"a":2}', String.raw`{"a":1,"\u0061":2}`]) {
      expect(parseJsonForMutation(text).error.message).toContain('重复键')
    }
    expect(parseJsonForMutation('{"a":1,"nested":{"a":2},"list":[{"a":3}]}').ok).toBe(true)
  })
})
