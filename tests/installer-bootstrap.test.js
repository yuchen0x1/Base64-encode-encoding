import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import path from 'node:path'
import { prepareInstallerRuntime, RUNTIME_DATA_FILES, startInstallerHelper } from '../electron/installer-bootstrap.js'

afterEach(() => vi.useRealTimers())

function childProcess() {
  const child = new EventEmitter()
  Object.assign(child, { connected: true, disconnect: vi.fn(), unref: vi.fn(), kill: vi.fn() })
  return child
}

describe('standalone update helper bootstrap', () => {
  it('copies ICU, V8 snapshots and explicit module configuration alongside the EXE', async () => {
    const base = path.resolve('.tmp-verify')
    await fs.mkdir(base, { recursive: true })
    const root = await fs.mkdtemp(path.join(base, 'runtime-unit-'))
    try {
      const sourceDir = path.join(root, 'installed app')
      await fs.mkdir(sourceDir)
      await fs.writeFile(path.join(sourceDir, 'app.exe'), 'exe')
      for (const file of RUNTIME_DATA_FILES) await fs.writeFile(path.join(sourceDir, file), file)
      const target = path.join(root, 'job', 'runtime.exe')
      await prepareInstallerRuntime(path.join(sourceDir, 'app.exe'), target)
      expect(await fs.readFile(target, 'utf8')).toBe('exe')
      for (const file of RUNTIME_DATA_FILES) expect(await fs.readFile(path.join(root, 'job', file), 'utf8')).toBe(file)
      expect(JSON.parse(await fs.readFile(path.join(root, 'job', 'package.json'), 'utf8')).type).toBe('module')
      await fs.unlink(path.join(sourceDir, 'icudtl.dat'))
      await expect(prepareInstallerRuntime(path.join(sourceDir, 'app.exe'), path.join(root, 'bad', 'runtime.exe'))).rejects.toThrow()
      await expect(fs.stat(path.join(root, 'bad'))).rejects.toThrow()
    } finally { await fs.rm(root, { recursive: true, force: true }) }
  })

  it('does not confirm readiness just because spawn returned; requires matching IPC acknowledgement', async () => {
    const child = childProcess()
    const spawnImpl = vi.fn(() => child)
    let ready = false
    const task = startInstallerHelper('C:/outside/runtime.exe', ['helper.mjs'], '0.0.6', {
      spawnImpl, env: { NODE_OPTIONS: '--invalid', EXAMPLE: 'keep' }
    }).then(value => { ready = true; return value })
    child.emit('message', { type: 'unrelated' })
    await Promise.resolve()
    expect(ready).toBe(false)
    expect(spawnImpl.mock.calls[0][2]).toMatchObject({
      cwd: path.dirname('C:/outside/runtime.exe'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { EXAMPLE: 'keep', ELECTRON_RUN_AS_NODE: '1' }
    })
    expect(spawnImpl.mock.calls[0][2].env.NODE_OPTIONS).toBeUndefined()
    child.emit('message', { type: 'installer-helper-ready', version: '0.0.6' })
    await expect(task).resolves.toBe(child)
    expect(child.disconnect).toHaveBeenCalledOnce()
    expect(child.unref).toHaveBeenCalledOnce()
  })

  it('rejects startup crashes and wrong-version acknowledgements', async () => {
    for (const action of ['exit', 'error', 'wrong-version']) {
      const child = childProcess()
      const task = startInstallerHelper('runtime.exe', [], '0.0.6', { spawnImpl: () => child })
      if (action === 'exit') child.emit('exit', 2147483651, null)
      else if (action === 'error') child.emit('error', new Error('ENOENT'))
      else child.emit('message', { type: 'installer-helper-ready', version: '0.0.5' })
      await expect(task).rejects.toThrow()
      expect(child.unref).not.toHaveBeenCalled()
    }
  })

  it('stops an unresponsive helper without confirming readiness', async () => {
    vi.useFakeTimers()
    const child = childProcess()
    const task = startInstallerHelper('runtime.exe', [], '0.0.6', { spawnImpl: () => child, timeoutMs: 100 })
    const check = expect(task).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(100)
    await check
    expect(child.kill).toHaveBeenCalledOnce()
  })
})
