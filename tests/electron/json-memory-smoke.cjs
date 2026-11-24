const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
app.setPath('userData', path.join(root, '.tmp-verify', 'json-memory-profile'))
const watchdog = setTimeout(() => {
  console.error('FAIL: JSON memory smoke timed out')
  app.exit(1)
}, 60000)

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 820,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })
  const errors = []
  win.webContents.on('console-message', event => {
    if (event.level === 'error') errors.push(event.message)
  })

  let exitCode = 0
  try {
    await win.loadFile(path.join(root, 'dist', 'index.html'))
    const rendererPid = await win.webContents.executeJavaScript(`(async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 10000) {
        const tool = document.querySelector('[data-tool-id="json-format"]');
        if (tool) {
          tool.click();
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const editorStartedAt = Date.now();
      while (!document.querySelector('.tool-component-wrapper .main-editor') &&
             Date.now() - editorStartedAt < 10000) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (!document.querySelector('.tool-component-wrapper .main-editor')) {
        throw new Error('JSON editor did not render');
      }
      return true;
    })()`)
    if (!rendererPid) throw new Error('JSON renderer did not become ready')

    const rendererProcessId = win.webContents.getOSProcessId()
    const getRendererMetrics = () => app.getAppMetrics().find(metric => metric.pid === rendererProcessId)
    const memoryMiB = value => value == null ? null : Number((value / 1024).toFixed(1))
    const sampleRendererMetrics = async () => {
      const samples = []
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 150))')
        const metric = getRendererMetrics()
        if (metric) samples.push(metric)
      }
      if (!samples.length) return null
      const latest = samples.at(-1)
      return {
        ...latest,
        memory: {
          ...latest.memory,
          workingSetSize: Math.max(...samples.map(sample => sample.memory.workingSetSize)),
          privateBytes: Math.max(...samples.map(sample => sample.memory.privateBytes || 0))
        }
      }
    }
    const afterOpen = await sampleRendererMetrics()

    const validation = await win.webContents.executeJavaScript(`(async () => {
      const editor = document.querySelector('.tool-component-wrapper .main-editor');
      const source = '[' + '12345678,'.repeat(583000) + '12345678]';
      editor.value = source;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const startedAt = Date.now();
      while (Date.now() - startedAt < 30000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (document.querySelector('.cyber-status-bar.success')) {
          return { bytes: editor.value.length };
        }
      }
      throw new Error('Single-line JSON validation timed out');
    })()`)
    if (validation.bytes < 5 * 1024 * 1024) {
      throw new Error(`Single-line JSON fixture was too small: ${validation.bytes}`)
    }
    const afterValidation = await sampleRendererMetrics()

    const formatted = await win.webContents.executeJavaScript(`(async () => {
      const editor = document.querySelector('.tool-component-wrapper .main-editor');
      document.querySelector('.editor-actions button').click();
      const startedAt = Date.now();
      while (Date.now() - startedAt < 30000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (editor.value.startsWith('[\\n  12345678')) return editor.value.length;
      }
      throw new Error('Single-line JSON formatting timed out');
    })()`)
    const afterFormat = await sampleRendererMetrics()
    if (errors.length) throw new Error(JSON.stringify({ errors }))

    console.log(`PERF_JSON_ONLY: ${JSON.stringify({
      rendererProcessType: afterFormat?.type || afterValidation?.type || afterOpen?.type || null,
      inputBytes: validation.bytes,
      formattedBytes: formatted,
      privateMemoryAfterOpenMiB: memoryMiB(afterOpen?.memory.privateBytes),
      privateMemoryAfterValidationMiB: memoryMiB(afterValidation?.memory.privateBytes),
      privateMemoryAfterFormatMiB: memoryMiB(afterFormat?.memory.privateBytes),
      workingSetAfterOpenMiB: memoryMiB(afterOpen?.memory.workingSetSize),
      workingSetAfterValidationMiB: memoryMiB(afterValidation?.memory.workingSetSize),
      workingSetAfterFormatMiB: memoryMiB(afterFormat?.memory.workingSetSize),
      peakWorkingSetMiB: memoryMiB(afterFormat?.memory.peakWorkingSetSize),
      memorySampleWindow: 'max of 4 renderer samples at 150ms intervals after each workload'
    })}`)
    console.log('PASS: isolated JSON-only renderer; single-line 5 MiB validation and formatting')
  } catch (error) {
    console.error('FAIL: JSON memory smoke', error, errors)
    exitCode = 1
  } finally {
    clearTimeout(watchdog)
    win.destroy()
    app.exit(exitCode)
  }
}).catch(error => {
  console.error('FAIL: JSON memory smoke', error)
  clearTimeout(watchdog)
  app.exit(1)
})
