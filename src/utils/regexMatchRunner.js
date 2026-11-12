export function createRegexMatchRunner(createWorker, timeoutMs = 500) {
  let activeJob = null

  function cancel() {
    if (!activeJob) return

    const job = activeJob
    activeJob = null
    clearTimeout(job.timeout)
    job.worker.terminate()
    job.resolve({ cancelled: true })
  }

  function run(payload) {
    cancel()

    return new Promise(resolve => {
      let worker
      try {
        worker = createWorker()
      } catch (error) {
        resolve({ error: error.message || '无法启动正则匹配 Worker。' })
        return
      }

      const job = { worker, resolve, timeout: null }
      activeJob = job

      function finish(result) {
        if (activeJob !== job) return

        activeJob = null
        clearTimeout(job.timeout)
        worker.terminate()
        resolve(result)
      }

      worker.onmessage = event => finish(event.data)
      worker.onerror = event => {
        event.preventDefault?.()
        finish({ error: event.message || '正则匹配 Worker 执行失败。' })
      }
      job.timeout = setTimeout(() => {
        finish({ error: `正则匹配超过 ${timeoutMs} 毫秒，已终止。` })
      }, timeoutMs)

      try {
        worker.postMessage(payload)
      } catch (error) {
        finish({ error: error.message || '无法发送正则匹配任务。' })
      }
    })
  }

  return { run, cancel }
}
