import { executeBatchRecipe } from './batchProcessing.js'

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, output: executeBatchRecipe(data.bytes, data.recipe) })
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message || '处理失败' })
  }
}
