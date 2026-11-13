// Hidden Chromium renderer with the application's production security settings.
// This checks file:// worker loading; it does not install or update the app.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { createHash } = require('node:crypto')

const root = path.resolve(__dirname, '../..')
const appRoot = process.env.TOOLBOX_SMOKE_ROOT || root
app.setPath('userData', path.join(root, '.tmp-verify', 'electron-smoke-profile'))
const watchdog = setTimeout(() => { console.error('FAIL: Electron smoke timed out'); app.exit(1) }, 30000)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true }
  })
  const errors = []
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  let exitCode = 0
  try {
    await win.loadFile(path.join(appRoot, 'dist', 'index.html'))
    const result = await win.webContents.executeJavaScript(`(async () => {
      document.querySelector('[aria-label="打开批量处理模式"]').click();
      await new Promise(resolve => setTimeout(resolve, 50));
      const preset = document.querySelector('[aria-label="选择常用配方"]');
      preset.value = 'binary-hash'; preset.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
      const input = document.querySelector('[aria-label="待处理文本，每行一条"]');
      input.value = '/wD+gA=='; input.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '开始处理').click();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 20000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const status = document.querySelector('.run-message[role="status"]');
        if (status?.textContent.includes('处理完成')) return { status: status.textContent, results: document.querySelector('.result-list').textContent };
      }
      throw new Error('Timed out waiting for batch worker');
    })()`)
    const expected = createHash('sha256').update(Buffer.from([255, 0, 254, 128])).digest('hex')
    if (!result.results.includes(expected) || errors.length) throw new Error(JSON.stringify({ result, errors }))
    console.log('PASS: Electron file:// sandboxed renderer; Base64 decode -> binary SHA-256; no console errors')
  } catch (error) {
    console.error('FAIL: Electron batch smoke', error)
    exitCode = 1
  } finally {
    clearTimeout(watchdog)
    win.destroy()
    app.exit(exitCode)
  }
}).catch(error => { console.error(error); clearTimeout(watchdog); app.exit(1) })
