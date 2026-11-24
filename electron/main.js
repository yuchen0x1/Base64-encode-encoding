import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerUpdaterIpc, scheduleStartupCheck, shutdownUpdater } from './updater.js'
import { focusWindow, setupSingleInstance } from './single-instance.js'
import { isTrustedRendererUrl, resolveSafeExternalUrl } from './ipc-security.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null
const devServerUrl = 'http://localhost:5173'

function openExternalSafely(rawUrl) {
  const safeUrl = resolveSafeExternalUrl(rawUrl)
  if (!safeUrl) return false
  shell.openExternal(safeUrl).catch((error) => {
    console.warn('[security] 打开外链失败:', error.message)
  })
  return true
}

const isPrimaryInstance = setupSingleInstance(app, () => {
  focusWindow(mainWindow)
})

function createWindow() {
  // 窗口图标取自构建产物 dist/（由 public/icon-512.png 复制而来）。
  // 打包后安装程序图标由 electron-builder 的 build/icon.ico 设置；
  // 这里仅在文件确实存在时设置窗口图标，避免开发/打包路径差异导致启动失败。
  const iconPath = path.join(__dirname, '../dist/icon-512.png')
  mainWindow = new BrowserWindow({
    ...(existsSync(iconPath) ? { icon: iconPath } : {}),
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: '极客工具箱 - ToolBox Pro',
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false
    },
    autoHideMenuBar: true
  })

  // 移除非必要系统菜单以获得整洁极简窗口
  Menu.setApplicationMenu(null)

  // 外部链接只交给系统浏览器，并且必须是官方 HTTPS 域名。
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })

  // 阻止导航离开受信主文档；即使同源子路径也不允许。
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const trusted = isTrustedRendererUrl(url, {
      isPackaged: app.isPackaged,
      indexFile: path.join(__dirname, '../dist/index.html'),
      devServerUrl
    })
    if (trusted) return
    event.preventDefault()
    openExternalSafely(url)
  })

  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  // The toolbox does not require camera, microphone, geolocation or device access.
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  // 生产环境加载 dist/index.html，开发环境支持 localhost
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('render-process-gone', () => {
    shutdownUpdater()
  })

  mainWindow.on('closed', () => {
    shutdownUpdater()
    mainWindow = null
  })
}

if (isPrimaryInstance) {
  app.whenReady().then(() => {
    createWindow()
    registerUpdaterIpc(ipcMain, { getMainWindow: () => mainWindow })
    // 启动后自动检查更新，发现新版本会直接推送事件到界面弹窗
    scheduleStartupCheck(4000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    shutdownUpdater()
  })
}
