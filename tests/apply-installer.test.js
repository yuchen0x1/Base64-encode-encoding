import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { runInstallerAssistant } from '../electron/apply-installer.js'

const require = createRequire(import.meta.url)
const { createPackage } = require('@electron/asar')

describe('installer assistant version gating', () => {
  it.each([false, true])('handles new process startup (error=%s) without losing the recovery installer', async fails => {
    const tempDir = path.resolve('.tmp-verify')
    fs.mkdirSync(tempDir, { recursive: true })
    const root = fs.mkdtempSync(path.join(tempDir, 'assistant-relaunch-'))
    const source = path.join(root, 'source')
    const resources = path.join(root, 'resources')
    fs.mkdirSync(source)
    fs.mkdirSync(resources)
    const installer = path.join(root, 'installer.exe')
    const exe = path.join(root, 'GeekToolbox.exe')
    fs.writeFileSync(installer, 'fixture: not executed')
    fs.writeFileSync(exe, Buffer.alloc(1024 * 1024))
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    await createPackage(source, path.join(resources, 'app.asar'))
    const child = new EventEmitter()
    child.unref = vi.fn()
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => child.emit(fails ? 'error' : 'spawn', ...(fails ? [new Error('launch denied')] : [])))
      return child
    })
    vi.stubEnv('ELECTRON_RUN_AS_NODE', '1')
    try {
      const result = runInstallerAssistant({ installer, exe, target: root, version: '1.2.3', log: path.join(root, 'install.log') }, {
        waitForExitImpl: async () => true,
        waitForUnlockImpl: async () => true,
        runInstallerImpl: async () => 0,
        sleepImpl: async () => {},
        spawnImpl
      })
      if (fails) {
        await expect(result).rejects.toThrow('launch denied')
        expect(fs.existsSync(installer)).toBe(true)
        expect(child.unref).not.toHaveBeenCalled()
      } else {
        await expect(result).resolves.toEqual({ ok: true, version: '1.2.3' })
        expect(fs.existsSync(installer)).toBe(false)
        expect(child.unref).toHaveBeenCalledOnce()
      }
      expect(spawnImpl).toHaveBeenCalledWith(exe, [], expect.objectContaining({ cwd: root, detached: true }))
      expect(spawnImpl.mock.calls[0][2].env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    } finally {
      vi.unstubAllEnvs()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not treat a present stale installation as a successful update', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-assistant-'))
    const installer = path.join(root, 'installer.exe')
    const exe = path.join(root, 'GeekToolbox.exe')
    const log = path.join(root, 'install.log')
    const resources = path.join(root, 'resources')
    fs.mkdirSync(resources)
    fs.writeFileSync(installer, 'fake installer')
    fs.writeFileSync(exe, Buffer.alloc(1024 * 1024))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.2.2' }))
    await createPackage(root, path.join(resources, 'app.asar'))

    const runInstallerImpl = vi.fn(async () => 0)
    const spawnImpl = vi.fn(() => ({ unref: vi.fn() }))

    try {
      const result = await runInstallerAssistant({
        pid: '123',
        installer,
        exe,
        target: root,
        version: '1.2.3',
        log
      }, {
        waitForExitImpl: vi.fn(async () => true),
        waitForUnlockImpl: vi.fn(async () => true),
        runInstallerImpl,
        sleepImpl: vi.fn(async () => {}),
        spawnImpl
      })

      expect(result).toEqual({ ok: false, reason: 'payload-verification-failed' })
      expect(runInstallerImpl).toHaveBeenCalledTimes(4) // three silent attempts and interactive fallback
      expect(runInstallerImpl).toHaveBeenLastCalledWith(installer, root, { silent: false })
      expect(spawnImpl).not.toHaveBeenCalled()
      expect(fs.existsSync(installer)).toBe(true)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('refuses to run when the expected version is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-assistant-'))
    const installer = path.join(root, 'installer.exe')
    fs.writeFileSync(installer, 'fake installer')
    const runInstallerImpl = vi.fn()

    try {
      const result = await runInstallerAssistant({ installer, target: root }, { runInstallerImpl })
      expect(result).toEqual({ ok: false, reason: 'missing-version' })
      expect(runInstallerImpl).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
