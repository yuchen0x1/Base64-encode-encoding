import { describe, expect, it, vi } from 'vitest'
import { collectRegexMatches, createRegexMatchRunner } from '../src/utils/regexMatch.js'

describe('collectRegexMatches', () => {
  it('collects all global matches and reports when the display limit is reached', () => {
    expect(collectRegexMatches({
      pattern: '[a-z]+',
      text: 'one 22 two',
      flags: 'g',
      global: true
    })).toEqual({ matches: ['one', 'two'], isTruncated: false })

    const capped = collectRegexMatches({
      pattern: 'a',
      text: 'a'.repeat(501),
      flags: 'g',
      global: true
    })
    expect(capped.matches).toHaveLength(500)
    expect(capped.isTruncated).toBe(true)
  })

  it('returns only the first match when global matching is disabled', () => {
    expect(collectRegexMatches({
      pattern: '\\d+',
      text: 'one 12 and 34',
      flags: '',
      global: false
    })).toEqual({ matches: ['12'], isTruncated: false })
  })

  it('advances after zero-length global matches', () => {
    expect(collectRegexMatches({
      pattern: '(?=a)',
      text: 'aa',
      flags: 'g',
      global: true
    })).toEqual({ matches: ['', ''], isTruncated: false })
  })

  it('preserves the empty-input behavior and reports invalid syntax', () => {
    expect(collectRegexMatches({
      pattern: 'a',
      text: '',
      flags: '',
      global: false
    })).toEqual({ matches: [], isTruncated: false })
    expect(() => collectRegexMatches({
      pattern: '[',
      text: 'text',
      flags: '',
      global: false
    })).toThrow()
  })

  it('terminates the worker and reports when a task exceeds its deadline', async () => {
    vi.useFakeTimers()
    const worker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null
    }
    const runner = createRegexMatchRunner(() => worker, 250)
    const resultPromise = runner.run({ pattern: '(a+)+$', text: 'a'.repeat(50) })

    await vi.advanceTimersByTimeAsync(250)

    await expect(resultPromise).resolves.toEqual({
      error: '正则匹配超过 250 毫秒，已终止。'
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('terminates a previous worker when a newer match starts', async () => {
    const workers = []
    const runner = createRegexMatchRunner(() => {
      const worker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null,
        onerror: null
      }
      workers.push(worker)
      return worker
    })
    const previous = runner.run({ pattern: 'a', text: 'a' })
    const current = runner.run({ pattern: 'b', text: 'b' })

    expect(workers[0].terminate).toHaveBeenCalledOnce()
    await expect(previous).resolves.toEqual({ cancelled: true })
    workers[1].onmessage({ data: { matches: ['b'], isTruncated: false } })
    await expect(current).resolves.toEqual({ matches: ['b'], isTruncated: false })
  })
})
