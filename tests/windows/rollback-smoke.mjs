import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { runInstallerAssistant } from '../../electron/apply-installer.js'

if (process.platform !== 'win32' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('The rollback smoke runs only on a disposable GitHub-hosted Windows runner')
}

const [target, exe, installer, previousInstaller, previousVersion, outputDir, candidateVersion] = process.argv.slice(2)
assert.ok(candidateVersion)

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

const result = await runInstallerAssistant({
  target, exe, installer,
  sha256: await hashFile(installer),
  // Force payload verification to fail after an otherwise real NSIS install.
  version: candidateVersion + '-unexpected',
  'rollback-installer': previousInstaller,
  'rollback-sha256': await hashFile(previousInstaller),
  'previous-version': previousVersion,
  log: path.join(outputDir, 'rollback.log')
}, {
  // The adjacent PowerShell smoke launches the restored binary with its
  // isolated profile and validates the real window independently.
  spawnImpl: () => {
    const child = new EventEmitter()
    child.unref = () => {}
    queueMicrotask(() => child.emit('spawn'))
    return child
  }
})

assert.deepEqual(result, { ok: true, version: previousVersion, rolledBack: true })
console.log(`PASS: actual NSIS package restored v${previousVersion} after target payload mismatch`)
