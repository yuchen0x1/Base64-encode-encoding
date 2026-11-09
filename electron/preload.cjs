const { contextBridge, ipcRenderer } = require('electron')

/**
 * 预加载桥：只暴露更新相关的最小 API，渲染进程始终运行在 sandbox + contextIsolation 下。
 */
const listeners = new Set()

ipcRenderer.on('update:event', (_event, payload) => {
  for (const listener of listeners) {
    try {
      listener(payload)
    } catch {
      /* 单个监听器异常不影响其它监听器 */
    }
  }
})

contextBridge.exposeInMainWorld('toolboxUpdater', {
  platform: 'electron',
  getInfo: () => ipcRenderer.invoke('update:info'),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onEvent: (listener) => {
    if (typeof listener !== 'function') return () => {}
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
})
