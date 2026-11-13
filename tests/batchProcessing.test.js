import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createBatchRecipe, parseBatchRecipe, executeBatchRecipe, csvSafeCell,
  batchResultsCsv, createBatchExport, BATCH_LIMITS
} from '../src/utils/batchProcessing.js'

const execute = (input, steps, options) => executeBatchRecipe(input, createBatchRecipe(steps, options))

describe('batch recipes and byte-safe execution', () => {
  it('executes Base64 -> JSON -> URL without manual transfer', () => {
    const input = Buffer.from('{"name":"工具箱🚀", "ready":true}').toString('base64')
    expect(execute(input, ['base64-decode', 'json-minify', 'url-encode'])).toBe(encodeURIComponent('{"name":"工具箱🚀","ready":true}'))
  })

  it('preserves binary data between decoding, hashing and re-encoding', () => {
    const bytes = Uint8Array.from([0xff, 0, 0xfe, 128, 33])
    const base64 = Buffer.from(bytes).toString('base64')
    expect(execute(base64, ['base64-decode', 'sha256'])).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(execute(base64, ['base64-decode', 'base64-encode'])).toBe(base64)
    expect(() => execute(base64, ['base64-decode'])).toThrow('UTF-8')
    expect(() => execute(bytes, ['json-format'])).toThrow('UTF-8')
  })

  it.each(['md5', 'sha1', 'sha256'])('hashes raw file bytes with %s', algorithm => {
    const bytes = Uint8Array.from([0, 255, 254, 1, 128])
    expect(execute(bytes, [algorithm], { upperHash: true })).toBe(createHash(algorithm).update(bytes).digest('hex').toUpperCase())
  })

  it('preserves UTF-8 BOM bytes in a round trip and accepts JSON BOM', () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, 123, 125])
    expect(execute(bytes, ['base64-encode', 'base64-decode', 'base64-encode'])).toBe(Buffer.from(bytes).toString('base64'))
    expect(execute(bytes, ['json-minify'])).toBe('{}')
  })

  it('handles Unicode, URL-safe, unpadded Base64, empty results and whitespace', () => {
    expect(execute('你好🚀', ['base64-encode', 'base64-decode'], { urlSafeBase64: true })).toBe('你好🚀')
    expect(execute(' Zg\n', ['base64-decode'])).toBe('f')
    expect(execute('', ['base64-encode'])).toBe('')
    expect(execute('null', ['json-minify'])).toBe('null')
    expect(execute('{}', ['json-format'])).toBe('{}')
  })

  it.each(['a', 'Zg=', 'Zg===', 'Zm9v=', 'Z=g=', '<script>'])('rejects malformed Base64 %s with the failing step', input => {
    expect(() => execute(input, ['base64-decode', 'sha256'])).toThrow('第 1 步「Base64 解码」')
  })

  it('reports a failure at the actual recipe step', () => {
    expect(() => execute('aGVsbG8=', ['base64-decode', 'json-format'])).toThrow('第 2 步「JSON 格式化」')
  })

  it('rejects oversized input before performing any transformation', () => {
    expect(() => execute(new Uint8Array(BATCH_LIMITS.fileBytes + 1), ['md5'])).toThrow('64 MB')
  })

  it('rejects unknown operations, invalid counts, invalid options and oversized recipes', () => {
    for (const steps of [[], Array(9).fill('md5'), ['__proto__'], ['constructor'], ['eval'], [null]]) {
      expect(() => createBatchRecipe(steps)).toThrow()
    }
    expect(() => createBatchRecipe(['md5'], { upperHash: 'false' })).toThrow('布尔值')
    expect(() => parseBatchRecipe(' '.repeat(BATCH_LIMITS.recipeBytes + 1))).toThrow('16 KB')
    expect(() => parseBatchRecipe('no json')).toThrow('有效的 JSON')
    expect(() => parseBatchRecipe('{"kind":"geek-toolbox-batch-recipe","version":2}')).toThrow('版本')
  })

  it('exports only a versioned allowlist and makes an independent snapshot', () => {
    const steps = ['url-decode', 'sha256']
    const options = { upperHash: true, input: 'SECRET' }
    const recipe = createBatchRecipe(steps, options)
    steps[0] = 'md5'
    options.upperHash = false
    const parsed = parseBatchRecipe(JSON.stringify({ ...recipe, input: 'SECRET', output: 'PRIVATE' }))
    expect(parsed.steps).toEqual(['url-decode', 'sha256'])
    expect(parsed.options.upperHash).toBe(true)
    expect(JSON.stringify(parsed)).not.toMatch(/SECRET|PRIVATE|input|output/)
  })

  it('retains the executed recipe and stopped status in result exports', () => {
    const snapshot = { recipe: createBatchRecipe(['md5']), total: 10, sourceMode: 'file', startedAt: '2026-11-13T00:00:00Z' }
    const result = createBatchExport([{ index: 1, source: 'one', ok: true, output: '' }], snapshot, 'stopped')
    expect(result).toMatchObject({ operation: 'md5', status: 'stopped', total: 1, requestedTotal: 10 })
    expect(result.rows[0]).toEqual({ index: 1, source: 'one', ok: true, output: '', error: null })
    expect(result.recipe).not.toBe(snapshot.recipe)
  })
})

describe('batch CSV spreadsheet safety', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\t=1', '\rhello', '\nhello', '  =1', '＝1', '＋1', '－1', '＠SUM(A1)'])('neutralizes %j', input => {
    expect(csvSafeCell(input).startsWith('"\'')).toBe(true)
  })

  it('escapes delimiters, quotes and newlines without splitting a cell', () => {
    expect(csvSafeCell('a,"b"\n=1')).toBe('"a,""b""\n=1"')
    expect(csvSafeCell('你好🚀')).toBe('"你好🚀"')
  })

  it('protects source, result and error cells, preserves a UTF-8 BOM', () => {
    const csv = batchResultsCsv([
      { index: 1, source: '=filename', ok: true, output: '@formula' },
      { index: 2, source: 'safe', ok: false, error: '+error' }
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"\'=filename"')
    expect(csv).toContain('"\'@formula"')
    expect(csv).toContain('"\'+error"')
  })
})
