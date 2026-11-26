import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, nextTick, ssrContextKey } from 'vue'
import ToolBatch from '../src/components/tools/ToolBatch.vue'

const { runners } = vi.hoisted(() => ({ runners: [] }))
vi.mock('../src/utils/batchRunner.js', () => ({
  createBatchRunner: () => {
    let rejectPending
    const runner = {
      run: vi.fn(() => new Promise((resolve, reject) => {
        runner.resolve = resolve
        rejectPending = reject
      })),
      pause: vi.fn(() => rejectPending?.(new DOMException('paused', 'AbortError'))),
      dispose: vi.fn(() => rejectPending?.(new DOMException('stopped', 'AbortError')))
    }
    runners.push(runner)
    return runner
  }
}))

const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode() {}, nextSibling() {},
  insert() {}, remove() {}, patchProp() {}
})
let app

function mountBatch() {
  app = renderer.createApp({ ...ToolBatch, render: () => null })
  app.provide(ssrContextKey, { modules: new Set() })
  return app.mount({}).$.setupState
}

afterEach(() => {
  app?.unmount()
  app = null
  runners.length = 0
})

describe('batch component pause and resume', () => {
  it('waits for the paused pass to stop before starting its replacement', async () => {
    const state = mountBatch()
    state.textInput = 'hello'
    const firstPass = state.start()
    state.pauseProcessing()
    const resumedPass = state.resumeProcessing()
    await nextTick()
    await nextTick()

    expect(runners).toHaveLength(2)
    expect(runners[1].dispose).not.toHaveBeenCalled()
    expect(state.results).toEqual([])
    runners[1].resolve('aGVsbG8=')
    await Promise.all([firstPass, resumedPass])

    expect(state.results).toHaveLength(1)
    expect(state.results[0]).toMatchObject({ ok: true, output: 'aGVsbG8=' })
    expect(state.runStatus).toBe('complete')
  })

  it('lets a stopped paused pass finish before starting a new batch', async () => {
    const state = mountBatch()
    state.textInput = 'old'
    const firstPass = state.start()
    state.pauseProcessing()
    state.cancel()
    state.textInput = 'new'
    const nextPass = state.start()
    await nextTick()
    await nextTick()

    expect(runners).toHaveLength(2)
    expect(runners[1].dispose).not.toHaveBeenCalled()
    runners[1].resolve('bmV3')
    await Promise.all([firstPass, nextPass])

    expect(state.results).toHaveLength(1)
    expect(state.results[0]).toMatchObject({ source: 'new', ok: true, output: 'bmV3' })
  })
})
