import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { runInstallerAssistant } from '../electron/apply-installer.js'

const require = createRequire(import.meta.url)
const { createPackage } = require('@electron/asar')

describe('installer assistant version gating', () => {
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
