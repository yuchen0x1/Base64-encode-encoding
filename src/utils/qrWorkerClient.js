import { createWorkerRpcClient } from './workerRpcClient.js'

export function createQrWorkerClient(workerFactory = () => new Worker(
  new URL('../workers/qrWorker.js', import.meta.url),
  { type: 'module' }
)) {
  const client = createWorkerRpcClient(workerFactory)
  return {
    decode(buffer) {
      return client.request('decode', buffer, [buffer])
    },
    cancel: client.cancel,
    dispose: client.dispose
  }
}
