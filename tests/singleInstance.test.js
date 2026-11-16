import { describe, expect, it, vi } from 'vitest'
import { focusWindow, setupSingleInstance } from '../electron/single-instance.js'

describe('single instance protection', () => {
  it('quits a secondary instance when the lock is unavailable', () => {
    const appLike = {
      requestSingleInstanceLock: vi.fn(() => false),
      quit: vi.fn(),
      on: vi.fn()
    }

    expect(setupSingleInstance(appLike)).toBe(false)
    expect(appLike.quit).toHaveBeenCalledOnce()
    expect(appLike.on).not.toHaveBeenCalled()
  })

  it('registers a second-instance callback for the primary instance', () => {
    const appLike = {
      requestSingleInstanceLock: vi.fn(() => true),
      quit: vi.fn(),
      on: vi.fn()
    }
    const callback = vi.fn()

    expect(setupSingleInstance(appLike, callback)).toBe(true)
    expect(appLike.on).toHaveBeenCalledWith('second-instance', expect.any(Function))

    const handler = appLike.on.mock.calls[0][1]
    handler('argv', 'cwd')
    expect(callback).toHaveBeenCalledWith('argv', 'cwd')
    expect(appLike.quit).not.toHaveBeenCalled()
  })

  it('restores, shows, and focuses a minimized window', () => {
    const window = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    }

    expect(focusWindow(window)).toBe(true)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})
