import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { registerUpdaterIpc, scheduleStartupCheck } from './updater.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null

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
      allowRunningInsecureContent: false
    },
    autoHideMenuBar: true
  })

  // 移除非必要系统菜单以获得整洁极简窗口
  Menu.setApplicationMenu(null)

  // 安全审计：拦截所有试图在主窗口中打开外部 HTTP/HTTPS 链接的危险跳转，改为调用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 阻止导航离开本地 App
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault()
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url)
      }
    }
  })

  // 生产环境加载 dist/index.html，开发环境支持 localhost
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerUpdaterIpc(ipcMain)
  createWindow()
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
