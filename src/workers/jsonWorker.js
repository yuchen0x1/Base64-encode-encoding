import { runJsonWorkerTask } from '../utils/jsonWorkerTasks.js'

self.onmessage = event => {
  const { id, type, payload } = event.data || {}
  self.postMessage({ id, result: runJsonWorkerTask(type, payload) })
}
