import { describe, it, expect } from 'vitest'
import { createBatchRunner } from '../src/utils/batchRunner.js'

function createFakeWorker() {
  const worker = {
    onmessage: null,
    onerror: null,
    terminated: false,
    messages: [],
    postMessage(message) { this.messages.push(message) },
    terminate() { this.terminated = true },
    respond(output) {
      this.onmessage?.({ data: { id: this.messages.at(-1)?.id, output } })
    }
  }
  return worker
}

describe('createBatchRunner', () => {
  it('resolves the worker output for an active item', async () => {
    const worker = createFakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const promise = runner.run(new Uint8Array([1, 2, 3]), { steps: [] })
    expect(worker.messages).toHaveLength(1)
    worker.respond('ok')
    await expect(promise).resolves.toBe('ok')
    runner.dispose()
  })

  it('pauses only the active item and rejects with AbortError', async () => {
    const worker = createFakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const promise = runner.run(new Uint8Array([1]), { steps: [] })
    expect(runner.pause()).toBe(true)
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
    expect(runner.pause()).toBe(false)

    await expect(runner.run(new Uint8Array([2]), { steps: [] })).rejects.toMatchObject({ name: 'AbortError' })
    runner.dispose()
  })

  it('rejects new work after dispose and releases the worker', async () => {
    const worker = createFakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    runner.dispose()
    await expect(runner.run(new Uint8Array([1]), { steps: [] })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects a second concurrent run on the same runner', async () => {
    const worker = createFakeWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const first = runner.run(new Uint8Array([1]), { steps: [] })
    await expect(runner.run(new Uint8Array([2]), { steps: [] })).rejects.toThrow('当前条目尚未处理完成')
    worker.respond('done')
    await expect(first).resolves.toBe('done')
    runner.dispose()
  })
})