import { createWorkerRpcClient } from './workerRpcClient.js'

export function createJsonWorkerClient(workerFactory = () => new Worker(
  new URL('../workers/jsonWorker.js', import.meta.url),
  { type: 'module' }
)) {
  return createWorkerRpcClient(workerFactory)
}
