// One worker is reused for a batch; disposal stops even a synchronous CPU-heavy
// operation. No main-thread fallback that could freeze the interface.
export function createBatchRunner({
  workerFactory = () => new Worker(new URL('./batchWorker.js', import.meta.url), { type: 'module' }),
  timeoutMs = 15000
} = {}) {
  let worker = null
  let pending = null
  let sequence = 0
  let disposed = false

  function terminate() {
    worker?.terminate()
    worker = null
  }

  function dispose() {
    disposed = true
    pending?.(new DOMException('处理已停止', 'AbortError'))
    terminate()
  }

  function run(bytes, recipe) {
    if (disposed) return Promise.reject(new DOMException('处理已停止', 'AbortError'))
    if (pending) return Promise.reject(new Error('当前条目尚未处理完成'))
    return new Promise((resolve, reject) => {
      const id = ++sequence
      let timer
      const finish = (error, output) => {
        if (pending !== finish) return
        clearTimeout(timer)
        pending = null
        if (error) reject(error)
        else resolve(output)
      }
      pending = finish
      try {
        worker ||= workerFactory()
        worker.onmessage = ({ data }) => {
          if (data.id !== id || !pending) return
          finish(data.error ? new Error(data.error) : null, data.output)
        }
        worker.onerror = event => {
          if (pending !== finish) return
          event.preventDefault?.()
          terminate()
          finish(new Error('后台处理失败，请重试或减少输入大小'))
        }
        timer = setTimeout(() => {
          terminate()
          finish(new Error('单条处理超过 15 秒，已终止；请减少数据量'))
        }, timeoutMs)
        // Copy only when the view does not own the complete backing buffer.
        const transferable = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice()
        worker.postMessage({ id, bytes: transferable, recipe }, [transferable.buffer])
      } catch (error) {
        terminate()
        finish(error)
      }
    })
  }

  return { run, dispose }
}
