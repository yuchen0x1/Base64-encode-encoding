import { ref } from 'vue'

const toasts = ref([])
let seed = 0

export function useToast() {
  function show(message, type = 'success', duration = 2200) {
    const id = ++seed
    toasts.value.push({ id, message, type })
    setTimeout(() => dismiss(id), duration)
  }

  function dismiss(id) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, show, dismiss }
}

export function globalToast(message, type = 'success', duration = 2200) {
  const { show } = useToast()
  show(message, type, duration)
}