import { describe, expect, it, vi } from 'vitest'
import { createWorkerRpcClient } from '../src/utils/workerRpcClient.js'
import { createQrWorkerClient } from '../src/utils/qrWorkerClient.js'

class FakeWorker {
  terminated = false
  posted = []
  onmessage = null
  onerror = null

  postMessage(message, transfer) {
    this.posted.push({ message, transfer })
  }

  terminate() {
    this.terminated = true
  }

  reply(id, result) {
    this.onmessage({ data: { id, result } })
  }
}

describe('worker RPC client', () => {
  it('matches concurrent requests by id and returns their results', async () => {
    const worker = new FakeWorker()
    const client = createWorkerRpcClient(() => worker)
    const first = client.request('first', { value: 1 })
    const second = client.request('second', { value: 2 })

    worker.reply(2, 'second result')
    worker.reply(1, 'first result')
    await expect(Promise.all([first, second])).resolves.toEqual(['first result', 'second result'])
  })

  it('terminates the worker and rejects outstanding work on cancellation', async () => {
    const worker = new FakeWorker()
    const client = createWorkerRpcClient(() => worker)
    const pending = client.request('slow', {})
    client.cancel()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminated).toBe(true)
  })

  it('rejects when worker creation or message posting fails', async () => {
    const constructionError = new Error('worker unavailable')
    const failedConstruction = createWorkerRpcClient(() => { throw constructionError })
    await expect(failedConstruction.request('task', {})).rejects.toBe(constructionError)

    const worker = new FakeWorker()
    worker.postMessage = () => { throw new Error('message rejected') }
    const failedMessage = createWorkerRpcClient(() => worker)
    await expect(failedMessage.request('task', {})).rejects.toThrow('message rejected')
  })

  it('terminates the worker and rejects pending requests after a runtime error', async () => {
    const worker = new FakeWorker()
    const client = createWorkerRpcClient(() => worker)
    const pending = client.request('slow', {})
    const event = { message: 'worker crashed', preventDefault: vi.fn() }
    worker.onerror(event)

    await expect(pending).rejects.toThrow('worker crashed')
    expect(event.preventDefault).toHaveBeenCalled()
    expect(worker.terminated).toBe(true)
  })

  it('does not create the QR worker until a scan starts and transfers image bytes', async () => {
    const worker = new FakeWorker()
    const factory = vi.fn(() => worker)
    const client = createQrWorkerClient(factory)
    const buffer = new Uint8Array([1, 2, 3]).buffer
    const pending = client.decode(buffer)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(worker.posted[0].message.type).toBe('decode')
    expect(worker.posted[0].transfer).toEqual([buffer])
    worker.reply(1, [{ text: 'decoded' }])
    await expect(pending).resolves.toEqual([{ text: 'decoded' }])
  })
})
