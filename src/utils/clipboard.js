import { globalToast } from '../composables/useToast.js'

// Report success only after the browser confirms the write. On LAN HTTP,
// clipboard may be absent altogether, or permissions can reject the promise.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    globalToast('复制失败，请手动选择并复制', 'error')
    return false
  }
}
