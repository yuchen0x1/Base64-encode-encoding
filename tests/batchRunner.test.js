import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBatchRunner } from '../src/utils/batchRunner.js'

afterEach(() => vi.useRealTimers())
const mockWorker = () => ({ postMessage: vi.fn(), terminate: vi.fn() })
const bytes = () => new TextEncoder().encode('hello')
const recipe = { steps: ['md5'], options: {} }

describe('batch worker lifecycle', () => {
  it('reuses a worker, rejects stale messages, and surfaces step errors', async () => {
    const worker = mockWorker()
    const factory = vi.fn(() => worker)
    const runner = createBatchRunner({ workerFactory: factory })
    const first = runner.run(bytes(), recipe)
    worker.onmessage({ data: { id: 99, output: 'stale' } })
    worker.onmessage({ data: { id: 1, output: 'digest' } })
    await expect(first).resolves.toBe('digest')
    const second = runner.run(bytes(), recipe)
    worker.onmessage({ data: { id: 1, output: 'stale' } })
    worker.onmessage({ data: { id: 2, error: '第 2 步失败' } })
    await expect(second).rejects.toThrow('第 2 步失败')
    expect(factory).toHaveBeenCalledTimes(1)
    runner.dispose()
  })

  it('immediately terminates active work when stopped and cannot restart a disposed runner', async () => {
    const worker = mockWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const task = runner.run(bytes(), recipe)
    runner.dispose()
    await expect(task).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    await expect(runner.run(bytes(), recipe)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('terminates timed-out work and recovers using a fresh worker', async () => {
    vi.useFakeTimers()
    const worker = mockWorker()
    const replacement = mockWorker()
    const factory = vi.fn().mockReturnValueOnce(worker).mockReturnValueOnce(replacement)
    const runner = createBatchRunner({ workerFactory: factory, timeoutMs: 10 })
    const task = runner.run(bytes(), recipe)
    const check = expect(task).rejects.toThrow('已终止')
    await vi.advanceTimersByTimeAsync(10)
    await check
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    const next = runner.run(bytes(), recipe)
    worker.onerror({ preventDefault() {} })
    replacement.onmessage({ data: { id: 2, output: 'recovered' } })
    await expect(next).resolves.toBe('recovered')
    runner.dispose()
  })

  it('reports worker startup, transport and runtime failures without hanging', async () => {
    const startup = createBatchRunner({ workerFactory: () => { throw new Error('no worker') } })
    await expect(startup.run(bytes(), recipe)).rejects.toThrow('no worker')
    const worker = mockWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const task = runner.run(bytes(), recipe)
    worker.onerror({ preventDefault() {} })
    await expect(task).rejects.toThrow('后台处理失败')
    worker.postMessage.mockImplementation(() => { throw new Error('clone failed') })
    await expect(runner.run(bytes(), recipe)).rejects.toThrow('clone failed')
    runner.dispose()
  })

  it('copies sliced views and prevents overlapping tasks', async () => {
    const worker = mockWorker()
    const runner = createBatchRunner({ workerFactory: () => worker })
    const input = Uint8Array.from([0, 1, 2, 3]).subarray(1, 3)
    const task = runner.run(input, recipe)
    const payload = worker.postMessage.mock.calls[0][0]
    expect(payload.bytes).toEqual(Uint8Array.from([1, 2]))
    expect(payload.bytes.buffer).not.toBe(input.buffer)
    await expect(runner.run(bytes(), recipe)).rejects.toThrow('尚未处理完成')
    worker.onmessage({ data: { id: 1, output: 'ok' } })
    await expect(task).resolves.toBe('ok')
    runner.dispose()
  })
})
