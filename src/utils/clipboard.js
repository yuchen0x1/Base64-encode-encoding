import { globalToast } from '../composables/useToast.js'

function legacyCopy(text) {
  if (typeof document === 'undefined' || !document.body) return false
  let input
  try {
    input = document.createElement('textarea')
    input.value = text
    input.setAttribute('readonly', '')
    input.style.position = 'fixed'
    input.style.top = '-9999px'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    input?.remove()
  }
}

// Report success only after the browser confirms the write. Legacy fallback
// keeps older browser and LAN HTTP workflows usable.
export async function copyText(text, { reportFailure = true } = {}) {
  const value = String(text ?? '')
  if (!value) {
    if (reportFailure) globalToast('没有可复制的内容', 'error')
    return false
  }

  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // Permission failures may still be recoverable through the user-gesture fallback.
  }

  if (legacyCopy(value)) return true
  if (reportFailure) globalToast('复制失败，请手动选择并复制', 'error')
  return false
}
