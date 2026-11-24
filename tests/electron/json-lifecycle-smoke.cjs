const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
app.setPath('userData', path.join(root, '.tmp-verify', 'json-lifecycle-profile'))
const watchdog = setTimeout(() => {
  console.error('FAIL: JSON lifecycle smoke timed out')
  app.exit(1)
}, 30000)

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
    const result = await win.webContents.executeJavaScript(`(async () => {
      const waitFor = async (selector, predicate = element => element) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 10000) {
          const element = document.querySelector(selector);
          if (element && predicate(element)) return element;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error('Timed out waiting for ' + selector);
      };

      const jsonTool = await waitFor('[data-tool-id="json-format"]');
      jsonTool.click();
      const editor = await waitFor('.tool-component-wrapper .main-editor');
      const NativeWorker = window.Worker;
      window.__jsonWorkersCreated = [];
      window.__jsonWorkersTerminated = [];
      window.__jsonWorkerTaskTypes = [];
      window.__holdJsonWorkers = true;
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          window.__jsonWorkersCreated.push(this);
        }
        postMessage(message, ...args) {
          window.__jsonWorkerTaskTypes.push(message.type);
          if (window.__holdJsonWorkers) return;
          return super.postMessage(message, ...args);
        }
        terminate() {
          window.__jsonWorkersTerminated.push(this);
          return super.terminate();
        }
      };

      const source = '{"payload":"' + 'x'.repeat(1_100_000) + '"}';
      editor.value = source;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      const startedAt = Date.now();
      while (!window.__jsonWorkersCreated.length && Date.now() - startedAt < 5000) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (!window.__jsonWorkersCreated.length) throw new Error('Large JSON validation did not create a Worker');
      const firstWorker = window.__jsonWorkersCreated[0];
      const sortButton = [...document.querySelectorAll('.editor-actions button')]
        .find(button => button.textContent.includes('排序键'));
      const cleanButton = [...document.querySelectorAll('.editor-actions button')]
        .find(button => button.textContent.includes('清理空值'));
      const competingActionsDisabled = Boolean(sortButton?.disabled && cleanButton?.disabled);

      document.querySelector('[data-tool-id="base64"]').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const terminatedOnDeactivate = window.__jsonWorkersTerminated.includes(firstWorker);
      const preservedAfterDeactivate = editor.value === source;

      document.querySelector('[data-tool-id="json-format"]').click();
      await waitFor('.tool-component-wrapper .main-editor');
      const retryStartedAt = Date.now();
      while (window.__jsonWorkersCreated.length < 2 && Date.now() - retryStartedAt < 5000) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      const retriedAfterActivate = window.__jsonWorkersCreated.length >= 2;
      const preservedAfterActivate = editor.value === source;

      const secondWorker = window.__jsonWorkersCreated[1];
      document.querySelector('[data-tool-id="base64"]').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const terminatedAfterSecondDeactivate = window.__jsonWorkersTerminated.includes(secondWorker);

      window.__holdJsonWorkers = false;
      document.querySelector('[data-tool-id="json-format"]').click();
      await waitFor('.cyber-status-bar.success');
      const completedWorker = window.__jsonWorkersCreated[2];
      if (!completedWorker) throw new Error('Reactivated JSON validation did not create a Worker');
      document.querySelector('[data-tool-id="base64"]').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      const idleWorkerTerminatedOnDeactivate = window.__jsonWorkersTerminated.includes(completedWorker);

      document.querySelector('[data-tool-id="json-format"]').click();
      await waitFor('.cyber-status-bar.success');
      const treeTab = [...document.querySelectorAll('.tool-tabs button')]
        .find(button => button.textContent.trim() === '树视图');
      const pathTab = [...document.querySelectorAll('.tool-tabs button')]
        .find(button => button.textContent.trim() === 'JSONPath');
      treeTab.click();
      await waitFor('.tree-viewport');
      const treePreparationsBeforePath = window.__jsonWorkerTaskTypes.filter(type => type === 'structure').length;

      pathTab.click();
      const pathInput = await waitFor('.query-bar input');
      pathInput.value = '$.payload';
      pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      [...document.querySelectorAll('.query-bar button')]
        .find(button => button.textContent.trim() === '查询').click();
      await waitFor('.result-summary');
      const treePreparationsAfterPath = window.__jsonWorkerTaskTypes.filter(type => type === 'structure').length;

      treeTab.click();
      await waitFor('.tree-viewport');
      const treePreparationsAfterReturn = window.__jsonWorkerTaskTypes.filter(type => type === 'structure').length;
      document.querySelector('[data-tool-id="base64"]').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      return {
        terminatedOnDeactivate,
        preservedAfterDeactivate,
        retriedAfterActivate,
        preservedAfterActivate,
        terminatedAfterSecondDeactivate,
        idleWorkerTerminatedOnDeactivate,
        competingActionsDisabled,
        treePreparationsBeforePath,
        treePreparationsAfterPath,
        treePreparationsAfterReturn
      };
    })()`)

    if (!result.terminatedOnDeactivate ||
        !result.preservedAfterDeactivate ||
        !result.retriedAfterActivate ||
        !result.preservedAfterActivate ||
        !result.terminatedAfterSecondDeactivate ||
        !result.idleWorkerTerminatedOnDeactivate ||
        !result.competingActionsDisabled ||
        result.treePreparationsAfterPath !== result.treePreparationsBeforePath ||
        result.treePreparationsAfterReturn <= result.treePreparationsAfterPath ||
        errors.length) {
      throw new Error(JSON.stringify({ result, errors }))
    }
    console.log('PASS: KeepAlive deactivation terminates pending and idle JSON Workers, reactivation retries validation, and input is preserved')
  } catch (error) {
    console.error('FAIL: JSON lifecycle smoke', error, errors)
    exitCode = 1
  } finally {
    clearTimeout(watchdog)
    win.destroy()
    app.exit(exitCode)
  }
}).catch(error => {
  console.error(error)
  clearTimeout(watchdog)
  app.exit(1)
})
