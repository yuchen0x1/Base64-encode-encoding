import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../src/utils/clipboard.js'
import { useToast } from '../src/composables/useToast.js'

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); useToast().toasts.value = [] })

describe('clipboard confirmation', () => {
  it('waits for the write to finish before confirming success', async () => {
    let finish
    const writeText = vi.fn(() => new Promise(resolve => { finish = resolve }))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    let confirmed = false
    const task = copyText('hello').then(result => { confirmed = result })
    await Promise.resolve()
    expect(confirmed).toBe(false)
    finish()
    await task
    expect(confirmed).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('handles rejected permissions without an unhandled promise or false success', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(copyText('hello')).resolves.toBe(false)
    expect(useToast().toasts.value.at(-1)).toMatchObject({ type: 'error', message: '复制失败，请手动选择并复制' })
  })

  it('handles clipboard being unavailable on LAN HTTP', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', {})
    await expect(copyText('hello')).resolves.toBe(false)
  })
})
