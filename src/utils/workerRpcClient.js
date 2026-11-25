function createAbortError() {
  return new DOMException('后台任务已取消', 'AbortError')
}

export function createWorkerRpcClient(workerFactory) {
  let worker = null
  let nextId = 0
  const pending = new Map()

  function stop(error = createAbortError()) {
    worker?.terminate()
    worker = null
    for (const request of pending.values()) request.reject(error)
    pending.clear()
  }

  function ensureWorker() {
    if (worker) return worker
    const instance = workerFactory()
    instance.onmessage = event => {
      const { id, result, error, kind } = event.data || {}
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      if (error) {
        const taskError = new Error(error)
        taskError.name = 'WorkerTaskError'
        taskError.kind = kind
        request.reject(taskError)
      } else {
        request.resolve(result)
      }
    }
    instance.onerror = event => {
      event.preventDefault?.()
      stop(new Error(event.message || '后台任务运行失败'))
    }
    worker = instance
    return worker
  }

  function request(type, payload, transfer = []) {
    let instance
    try {
      instance = ensureWorker()
    } catch (error) {
      return Promise.reject(error)
    }

    const id = ++nextId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      try {
        instance.postMessage({ id, type, payload }, transfer)
      } catch (error) {
        pending.delete(id)
        reject(error)
      }
    })
  }

  return {
    request,
    cancel: () => stop(),
    dispose: () => stop()
  }
}
