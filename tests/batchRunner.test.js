import { describe, expect, it, vi } from 'vitest'
import { createBatchRunner } from '../src/utils/batchRunner.js'

class FakeWorker {
  constructor() {
    this.messages = []
    this.terminated = false
  }

  postMessage(message) {
    this.messages.push(structuredClone(message))
  }

  terminate() {
    this.terminated = true
  }
}

describe('batch worker runner lifecycle', () => {
  it('posts a structured-cloneable recipe and resolves the worker output', async () => {
    const worker = new FakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const pending = runner.run(new Uint8Array([1, 2, 3]), { steps: ['sha256'], options: {} })

    expect(worker.messages).toHaveLength(1)
    expect(worker.messages[0].bytes).toEqual(new Uint8Array([1, 2, 3]))
    worker.onmessage({ data: { id: worker.messages[0].id, output: 'ok' } })
    await expect(pending).resolves.toBe('ok')
    runner.dispose()
  })

  it('pauses only an active item and rejects later runs until disposed', async () => {
    const worker = new FakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    expect(runner.pause()).toBe(false)

    const pending = runner.run(new Uint8Array([4]), { steps: ['md5'], options: {} })
    expect(runner.pause()).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
    await expect(runner.run(new Uint8Array([5]), { steps: ['md5'], options: {} }))
      .rejects.toMatchObject({ name: 'AbortError' })

    runner.dispose()
  })

  it('dispose rejects active work and reports worker construction failures', async () => {
    const neverResponds = new FakeWorker()
    const runner = createBatchRunner({ workerFactory: () => neverResponds })
    const pending = runner.run(new Uint8Array([6]), { steps: ['sha1'], options: {} })
    runner.dispose()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })

    const failure = createBatchRunner({
      workerFactory: () => { throw new Error('worker unavailable') }
    })
    await expect(failure.run(new Uint8Array([7]), { steps: ['md5'], options: {} }))
      .rejects.toThrow('worker unavailable')
    failure.dispose()
  })

  it('does not allow overlapping items on one runner', async () => {
    const worker = new FakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const pending = runner.run(new Uint8Array([8]), { steps: ['md5'], options: {} })
    await expect(runner.run(new Uint8Array([9]), { steps: ['md5'], options: {} }))
      .rejects.toThrow('尚未处理完成')
    worker.onmessage({ data: { id: worker.messages[0].id, output: 'done' } })
    await expect(pending).resolves.toBe('done')
    runner.dispose()
  })
})
