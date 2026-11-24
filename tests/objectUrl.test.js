import { afterEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_URL_REVOKE_DELAY_MS, revokeObjectURLAfter } from '../src/utils/objectUrl.js'

afterEach(() => vi.useRealTimers())

describe('object URL lifecycle', () => {
  it('keeps a download URL alive through the click and revokes it later', () => {
    vi.useFakeTimers()
    const revoke = vi.fn()

    const timer = revokeObjectURLAfter('blob:test', OBJECT_URL_REVOKE_DELAY_MS, revoke)
    expect(revoke).not.toHaveBeenCalled()

    vi.advanceTimersByTime(OBJECT_URL_REVOKE_DELAY_MS - 1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledWith('blob:test')
    clearTimeout(timer)
  })
})
