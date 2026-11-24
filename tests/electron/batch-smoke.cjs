// Hidden Chromium renderer with the application's production security settings.
// This checks file:// worker loading; it does not install or update the app.
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { mkdirSync, writeFileSync } = require('node:fs')

const root = path.resolve(__dirname, '../..')
const appRoot = process.env.TOOLBOX_SMOKE_ROOT || root
const captureScreenshot = process.env.TOOLBOX_CAPTURE_SCREENSHOT === '1'
const smokeStartedAt = Date.now()
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
    const workspaceReadyMs = Date.now() - smokeStartedAt
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
      const waitForSelector = async selector => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const element = document.querySelector(selector);
          if (element) return element;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        throw new Error('Missing rendered control: ' + selector);
      };
      tool.click();
      const preset = await waitForSelector('[aria-label="选择常用配方"]');
      preset.value = 'binary-hash'; preset.dispatchEvent(new Event('change', { bubbles: true }));
      const input = await waitForSelector('[aria-label="待处理文本，每行一条"]');
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

    const deferredWorkers = await win.webContents.executeJavaScript(`(async () => {
      const NativeWorker = window.Worker;
      window.__workerCreations = 0;
      window.__workerInstances = [];
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          this.__toolboxUrl = String(args[0]);
          this.__toolboxTerminated = false;
          window.__workerCreations++;
          window.__workerInstances.push(this);
        }
        terminate() {
          this.__toolboxTerminated = true;
          super.terminate();
        }
      };
      const qrTool = document.querySelector('[data-tool-id="qrcode-generator"]');
      qrTool.click();
      for (let attempt = 0; !document.querySelector('.qr-image') && attempt < 100; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const workerCountAfterOpen = window.__workerCreations;
      const preview = document.querySelector('.qr-image');
      if (!preview) throw new Error('QR generation did not render a preview');
      document.querySelector('.mode-switch button:nth-child(2)').click();
      const sourceImage = new Image();
      sourceImage.src = preview.src;
      await sourceImage.decode();
      const largeCanvas = document.createElement('canvas');
      largeCanvas.width = 2048;
      largeCanvas.height = 2048;
      const context = largeCanvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(sourceImage, 0, 0, largeCanvas.width, largeCanvas.height);
      const data = atob(largeCanvas.toDataURL('image/png').split(',')[1]);
      const bytes = Uint8Array.from(data, character => character.charCodeAt(0));
      window.__qrImageBytes = bytes;
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'worker-fixture.png', { type: 'image/png' }));
      const fileInput = document.querySelector('.hidden-input');
      fileInput.files = transfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      const startedAt = Date.now();
      while (Date.now() - startedAt < 20000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        const result = document.querySelector('.result-item .result-text');
        if (result) return {
          workerCountAfterOpen,
          workerCountAfterScan: window.__workerCreations,
          result: result.textContent
        };
      }
      throw new Error('Timed out waiting for QR worker');
    })()`)
    if (deferredWorkers.workerCountAfterOpen !== 0 ||
        deferredWorkers.workerCountAfterScan !== 1 ||
        deferredWorkers.result !== 'https://www.toolhelper.cn/') {
      throw new Error(`QR worker lazy-load or recognition failed: ${JSON.stringify(deferredWorkers)}`)
    }

    const qrDeactivation = await win.webContents.executeJavaScript(`(async () => {
      const qrWorker = window.__workerInstances.find(worker => worker.__toolboxUrl.includes('qrWorker'));
      if (!qrWorker) throw new Error('QR worker instance was not tracked');
      document.querySelector('[data-tool-id="base64"]').click();
      const startedAt = Date.now();
      while (!qrWorker.__toolboxTerminated && Date.now() - startedAt < 5000) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const terminatedOnDeactivate = qrWorker.__toolboxTerminated;
      document.querySelector('[data-tool-id="qrcode-generator"]').click();
      const reactivatedAt = Date.now();
      while (!document.querySelector('.result-item .result-text') && Date.now() - reactivatedAt < 5000) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return {
        terminatedOnDeactivate,
        resultPreserved: document.querySelector('.result-item .result-text')?.textContent === 'https://www.toolhelper.cn/'
      };
    })()`)
    if (!qrDeactivation.terminatedOnDeactivate || !qrDeactivation.resultPreserved) {
      throw new Error(`QR worker was not released on KeepAlive deactivation: ${JSON.stringify(qrDeactivation)}`)
    }

    const qrCancellation = await win.webContents.executeJavaScript(`(async () => {
      const bytes = window.__qrImageBytes;
      if (!bytes) throw new Error('QR fixture bytes were not preserved');
      const fileInput = document.querySelector('.hidden-input');
      const workerCountBefore = window.__workerCreations;
      const nativeArrayBuffer = File.prototype.arrayBuffer;
      let deferredRead;
      File.prototype.arrayBuffer = function() {
        if (this.name.endsWith('-race.png')) return new Promise(resolve => { deferredRead = resolve; });
        return nativeArrayBuffer.call(this);
      };
      try {
        const startDeferredScan = async name => {
          deferredRead = null;
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], name, { type: 'image/png' }));
          fileInput.files = transfer.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          const startedAt = Date.now();
          while (!deferredRead && Date.now() - startedAt < 5000) await new Promise(resolve => setTimeout(resolve, 10));
          if (!deferredRead) throw new Error('Deferred image read did not start');
          return () => {
            const resolve = deferredRead;
            deferredRead = null;
            resolve(bytes.buffer.slice(0));
          };
        };

        const releaseAfterClear = await startDeferredScan('clear-race.png');
        [...document.querySelectorAll('.options button')].find(button => button.textContent.includes('清空')).click();
        releaseAfterClear();
        await new Promise(resolve => setTimeout(resolve, 100));
        const workerCountAfterClear = window.__workerCreations;

        const releaseAfterInvalidReplacement = await startDeferredScan('replace-race.png');
        const invalid = new File(['invalid'], 'unsupported.txt', { type: 'text/plain' });
        const invalidTransfer = new DataTransfer();
        invalidTransfer.items.add(invalid);
        fileInput.files = invalidTransfer.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        releaseAfterInvalidReplacement();
        await new Promise(resolve => setTimeout(resolve, 100));
        const invalidError = document.querySelector('.decode-body [role="alert"]')?.textContent || '';

        const releaseAfterModeSwitch = await startDeferredScan('mode-race.png');
        document.querySelector('.mode-switch button:nth-child(1)').click();
        releaseAfterModeSwitch();
        await new Promise(resolve => setTimeout(resolve, 100));
        const workerCountAfterModeSwitch = window.__workerCreations;
        document.querySelector('.mode-switch button:nth-child(2)').click();

        return {
          workerCountBefore,
          workerCountAfterClear,
          workerCountAfterInvalidReplacement: window.__workerCreations,
          workerCountAfterModeSwitch,
          invalidError
        };
      } finally {
        File.prototype.arrayBuffer = nativeArrayBuffer;
      }
    })()`)
    if (qrCancellation.workerCountAfterClear !== qrCancellation.workerCountBefore ||
        qrCancellation.workerCountAfterInvalidReplacement !== qrCancellation.workerCountBefore ||
        qrCancellation.workerCountAfterModeSwitch !== qrCancellation.workerCountBefore ||
        !qrCancellation.invalidError.includes('不支持的图片格式')) {
      throw new Error(`QR cancellation or invalid replacement race failed: ${JSON.stringify(qrCancellation)}`)
    }

    const rendererProcessId = win.webContents.getOSProcessId()
    const getRendererMetrics = () => app.getAppMetrics().find(metric => metric.pid === rendererProcessId)
    const memoryMiB = value => value == null ? null : Number((value / 1024).toFixed(1))
    const sampleRendererMetrics = async () => {
      const samples = []
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))')
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
    const rendererAfterQr = await sampleRendererMetrics()
    const jsonValidation = await win.webContents.executeJavaScript(`(async () => {
      const jsonTool = document.querySelector('[data-tool-id="json-format"]');
      jsonTool.click();
      const startedAt = Date.now();
      let editor;
      while (Date.now() - startedAt < 10000) {
        editor = document.querySelector('.tool-component-wrapper .main-editor');
        if (editor) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!editor) throw new Error('JSON editor did not render');
      const source = JSON.stringify({
        payload: Array.from({ length: 5120 }, () => 'x'.repeat(1024))
      }, null, 2);
      const heapMiB = () => performance.memory
        ? Number((performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1))
        : null;
      editor.value = source;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const validationStartedAt = Date.now();
      while (Date.now() - validationStartedAt < 20000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (document.querySelector('.cyber-status-bar.success')) break;
      }
      if (!document.querySelector('.cyber-status-bar.success')) throw new Error('Large JSON validation timed out');
      const validationMs = Date.now() - validationStartedAt;
      const validationHeapMiB = heapMiB();
      return {
        workerCreations: window.__workerCreations,
        length: editor.value.length,
        validationMs,
        validationHeapMiB
      };
    })()`)
    if (jsonValidation.workerCreations !== 2 || jsonValidation.length < 5 * 1024 * 1024) {
      throw new Error(`Large JSON worker validation failed: ${JSON.stringify(jsonValidation)}`)
    }
    const rendererAfterValidation = await sampleRendererMetrics()

    const jsonFormat = await win.webContents.executeJavaScript(`(async () => {
      const editor = document.querySelector('.tool-component-wrapper .main-editor');
      const formatStartedAt = Date.now();
      document.querySelector('.editor-actions button').click();
      while (Date.now() - formatStartedAt < 20000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (editor.value.startsWith('{\\n  "payload"')) {
          return {
            workerCreations: window.__workerCreations,
            length: editor.value.length,
            formatMs: Date.now() - formatStartedAt
          };
        }
      }
      throw new Error('Large JSON worker formatting timed out');
    })()`)
    if (jsonFormat.workerCreations !== 2 || jsonFormat.length < 5 * 1024 * 1024) {
      throw new Error(`Large JSON worker formatting failed: ${JSON.stringify(jsonFormat)}`)
    }
    const rendererAfterFormat = await sampleRendererMetrics()
    const jsonWorker = {
      ...jsonValidation,
      ...jsonFormat,
      validationHeapMiB: jsonValidation.validationHeapMiB
    }

    const jsonWorkerFailure = await win.webContents.executeJavaScript(`(async () => {
      const editor = document.querySelector('.tool-component-wrapper .main-editor');
      const previousWorkerCount = window.__workerCreations;
      const source = '{"payload":' + JSON.stringify('z'.repeat(5 * 1024 * 1024)) + '}';
      editor.value = source;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const validationStartedAt = Date.now();
      while (Date.now() - validationStartedAt < 20000) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (window.__workerCreations > previousWorkerCount &&
            document.querySelector('.cyber-status-bar.success')) break;
      }
      if (window.__workerCreations <= previousWorkerCount ||
          !document.querySelector('.cyber-status-bar.success')) {
        throw new Error('Large JSON validation worker did not restart')
      }
      return {
        bytes: editor.value.length
      };
    })()`)
    if (jsonWorkerFailure.bytes < 5 * 1024 * 1024) {
      throw new Error(`Large single-line JSON validation fixture was too small: ${JSON.stringify(jsonWorkerFailure)}`)
    }
    const rendererAfterSingleLineValidation = await sampleRendererMetrics()

    const jsonWorkerFailureResult = await win.webContents.executeJavaScript(`(async () => {
      const editor = document.querySelector('.tool-component-wrapper .main-editor');

      const sourceBeforeFailedFormat = editor.value;
      const activeWorker = window.__workerInstances[window.__workerInstances.length - 1];
      document.querySelector('.editor-actions button').click();
      activeWorker.onerror({ message: 'simulated worker failure', preventDefault() {} });
      const errorStartedAt = Date.now();
      while (Date.now() - errorStartedAt < 5000) {
        await new Promise(resolve => setTimeout(resolve, 20));
        const error = document.querySelector('.cyber-status-bar.error [role="alert"]');
        if (error?.textContent.includes('后台处理模块不可用')) {
          return {
            inputUnchanged: editor.value === sourceBeforeFailedFormat,
            error: error.textContent
          };
        }
      }
      throw new Error('Large JSON worker failure was not reported')
    })()`)
    if (!jsonWorkerFailureResult.inputUnchanged) {
      throw new Error(`Large JSON worker failure modified input: ${JSON.stringify(jsonWorkerFailureResult)}`)
    }

    const jsonTreeBudget = await win.webContents.executeJavaScript(`(async () => {
      const editor = document.querySelector('.tool-component-wrapper .main-editor');
      const row = '{' + Array.from({ length: 50 }, (_, index) => '"key' + index + '":' + index).join(',') + '}';
      const source = '[' + Array.from({ length: 50 }, () => row).join(',') + ']';
      editor.value = source;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const treeTab = [...document.querySelectorAll('.tool-tabs button')]
        .find(button => button.textContent.trim() === '树视图');
      if (!treeTab) throw new Error('JSON tree tab was not found');
      treeTab.click();

      const startedAt = Date.now();
      while (Date.now() - startedAt < 10000) {
        await new Promise(resolve => setTimeout(resolve, 25));
        const viewport = document.querySelector('.tree-viewport');
        const truncated = viewport?.querySelector('.tree-truncated');
        if (truncated) {
          return {
            visibleRows: viewport.querySelectorAll('.json-tree-row').length,
            notice: truncated.textContent
          };
        }
      }
      throw new Error('JSON tree did not enforce its visible-node budget');
    })()`)
    if (jsonTreeBudget.visibleRows > 1000 || !jsonTreeBudget.notice.includes('1000')) {
      throw new Error(`JSON tree visible-node budget failed: ${JSON.stringify(jsonTreeBudget)}`)
    }
    if (errors.length) throw new Error(JSON.stringify({ errors }))
    console.log(`PERF: ${JSON.stringify({
      startupScriptToWorkspaceMs: workspaceReadyMs,
      jsonBytes: jsonWorker.length,
      jsonWorkerValidationMs: jsonWorker.validationMs,
      jsonWorkerFormatMs: jsonWorker.formatMs,
      rendererJsHeapAfterValidationMiB: jsonWorker.validationHeapMiB,
      rendererProcessType: rendererAfterFormat?.type || rendererAfterValidation?.type || rendererAfterQr?.type || null,
      rendererWorkingSetAfterQrMiB: memoryMiB(rendererAfterQr?.memory.workingSetSize),
      rendererWorkingSetAfterValidationMiB: memoryMiB(rendererAfterValidation?.memory.workingSetSize),
      rendererWorkingSetAfterFormatMiB: memoryMiB(rendererAfterFormat?.memory.workingSetSize),
      rendererPeakWorkingSetAfterFormatMiB: memoryMiB(rendererAfterFormat?.memory.peakWorkingSetSize),
      rendererPrivateMemoryAfterQrMiB: memoryMiB(rendererAfterQr?.memory.privateBytes),
      rendererPrivateMemoryAfterValidationMiB: memoryMiB(rendererAfterValidation?.memory.privateBytes),
      rendererPrivateMemoryAfterFormatMiB: memoryMiB(rendererAfterFormat?.memory.privateBytes),
      singleLineJsonBytes: jsonWorkerFailure.bytes,
      rendererPrivateMemoryAfterSingleLineMiB: memoryMiB(rendererAfterSingleLineValidation?.memory.privateBytes),
      memorySampleWindow: 'max of 3 renderer samples at 100ms intervals after each workload',
      rendererCpuPercentDuringFormat: rendererAfterFormat ? Number(rendererAfterFormat.cpu.percentCPUUsage.toFixed(1)) : null
    })}`)
    if (!jsonWorkerFailureResult.inputUnchanged) {
      throw new Error(`Large JSON worker failure modified input: ${JSON.stringify(jsonWorkerFailureResult)}`)
    }
    console.log('PASS: Electron file:// renderer; batch Worker; lazy/cancellable QR Worker; 5 MiB JSON Worker; global JSON tree DOM cap; no console errors')
  } catch (error) {
    console.error('FAIL: Electron batch smoke', error, errors)
    exitCode = 1
  } finally {
    clearTimeout(watchdog)
    win.destroy()
    app.exit(exitCode)
  }
}).catch(error => { console.error(error); clearTimeout(watchdog); app.exit(1) })
