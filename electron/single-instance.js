export function focusWindow(window) {
  if (!window) return false

  if (typeof window.isMinimized === 'function' && window.isMinimized()) {
    window.restore?.()
  }
  window.show?.()
  window.focus?.()
  return true
}

export function setupSingleInstance(appLike, onSecondInstance) {
  const isPrimaryInstance = appLike.requestSingleInstanceLock()
  if (!isPrimaryInstance) {
    appLike.quit()
    return false
  }

  appLike.on('second-instance', (...args) => {
    onSecondInstance?.(...args)
  })
  return true
}
