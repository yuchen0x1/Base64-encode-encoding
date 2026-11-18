// Hidden Chromium renderer with the application's production security settings.
// This checks file:// worker loading; it does not install or update the app.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { mkdirSync, writeFileSync } = require('node:fs')

const root = path.resolve(__dirname, '../..')
const appRoot = process.env.TOOLBOX_SMOKE_ROOT || root
const captureScreenshot = process.env.TOOLBOX_CAPTURE_SCREENSHOT === '1'
app.setPath('userData', path.join(root, '.tmp-verify', 'electron-smoke-profile'))
const watchdog = setTimeout(() => { console.error('FAIL: Electron smoke timed out'); app.exit(1) }, 60000)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
    offscreen: captureScreenshot
  })
  const errors = []
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  let exitCode = 0
  try {
    await win.loadFile(path.join(appRoot, 'dist', 'index.html'))
    const brandLayout = await win.webContents.executeJavaScript(`(async () => {
      let locale;
      for (let attempt = 0; !locale && attempt < 100; attempt++) {
        locale = document.querySelector('.locale-picker select');
        if (!locale) await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!locale) throw new Error('Workspace did not render before visual checks');
      locale.value = 'zh-CN'; locale.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 100));
      const title = document.querySelector('.brand-title');
      const bounds = title.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, lineHeight: Number.parseFloat(getComputedStyle(title).lineHeight) };
    })()`)
    if (brandLayout.height > brandLayout.lineHeight * 1.5) {
      throw new Error(`Sidebar brand title wrapped vertically: ${JSON.stringify(brandLayout)}`)
    }
    if (captureScreenshot) {
      await new Promise(resolve => setTimeout(resolve, 250))
      const screenshot = await win.webContents.capturePage()
      const screenshotPath = path.join(root, 'docs', 'screenshots', 'desktop-base64-windows.png')
      mkdirSync(path.dirname(screenshotPath), { recursive: true })
      writeFileSync(screenshotPath, screenshot.toPNG())
      console.log(`Screenshot captured: ${screenshotPath}`)
    }
    const result = await win.webContents.executeJavaScript(`(async () => {
      let locale;
      for (let attempt = 0; !locale && attempt < 100; attempt++) {
        locale = document.querySelector('.locale-picker select');
        if (!locale) await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!locale) throw new Error('Workspace did not render: ' + document.body.innerText.slice(0, 240));
      locale.value = 'en-US'; locale.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      const tool = document.querySelector('[data-tool-id="batch-processor"]');
      if (!tool?.getAttribute('aria-label')?.startsWith('Open ')) throw new Error('English tool navigation missing');
      tool.click();
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
    console.error('FAIL: Electron batch smoke', error, errors)
    exitCode = 1
  } finally {
    clearTimeout(watchdog)
    win.destroy()
    app.exit(exitCode)
  }
}).catch(error => { console.error(error); clearTimeout(watchdog); app.exit(1) })
