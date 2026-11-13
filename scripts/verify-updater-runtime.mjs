import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareInstallerRuntime, startInstallerHelper } from '../electron/installer-bootstrap.js'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.platform !== 'win32') {
  console.log('NOT APPLICABLE: Windows standalone update helper')
  process.exit(0)
}
const tempRoot = path.join(root, '.tmp-verify')
await fs.mkdir(tempRoot, { recursive: true })
const job = await fs.mkdtemp(path.join(tempRoot, 'updater-runtime-smoke-'))
const sourceExe = process.env.TOOLBOX_SMOKE_RUNTIME || require('electron')
const runtime = path.join(job, 'runtime.exe')
let child
try {
  await prepareInstallerRuntime(sourceExe, runtime)
  await fs.copyFile(path.join(root, 'electron/apply-installer.js'), path.join(job, 'helper.mjs'))
  await fs.copyFile(path.join(root, 'electron/installer-verification.js'), path.join(job, 'installer-verification.js'))
  const installer = path.join(job, 'never-run.exe')
  await fs.writeFile(installer, 'fixture: must never execute')
  child = await startInstallerHelper(runtime, [
    path.join(job, 'helper.mjs'), '--pid', String(process.pid),
    '--installer', installer, '--target', path.join(job, 'unused-target'),
    '--exe', path.join(job, 'unused-target', 'app.exe'), '--version', '0.0.6',
    '--log', path.join(job, 'install.log'), '--bootstrap-ipc', '1'
  ], '0.0.6')
  const log = await fs.readFile(path.join(job, 'install.log'), 'utf8')
  if (!log.includes('安装助手启动') || log.includes('开始静默安装')) throw new Error('Unexpected helper lifecycle')
  const exited = once(child, 'exit')
  child.ref()
  child.kill()
  await exited
  child = null
  console.log('PASS: copied Electron EXE + ICU + V8 snapshots; real helper imports and acknowledges ready before waiting for the parent')

  // Exercise the exact failure from the user's machine and ensure it cannot be
  // mistaken for a successful handoff. No installer is executed in this check.
  const brokenDir = path.join(job, 'broken-runtime')
  await fs.mkdir(brokenDir)
  const brokenExe = path.join(brokenDir, 'runtime.exe')
  await fs.copyFile(sourceExe, brokenExe)
  let rejected = false
  try {
    await startInstallerHelper(brokenExe, ['-e', 'process.exit(0)'], '0.0.6', { timeoutMs: 10000 })
  } catch { rejected = true }
  if (!rejected) throw new Error('Broken runtime incorrectly reported readiness')
  console.log('PASS: EXE-only crash rejects handoff; parent is still running')

  // Direct runtime probe catches corrupted or missing startup data independently
  // of the IPC acknowledgement used by the actual installer helper.
  const probe = spawn(runtime, ['-e', 'process.stdout.write("runtime-ok")'], {
    cwd: job, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = ''
  probe.stdout.on('data', data => { stdout += data })
  const [code] = await once(probe, 'exit')
  if (code !== 0 || stdout !== 'runtime-ok') throw new Error(`Standalone runtime probe failed: ${code}`)
  console.log('PASS: standalone runtime executes Node code successfully')
} finally {
  if (child) {
    const exited = once(child, 'exit')
    child.ref()
    child.kill()
    await exited
  }
  // job was created under the verified project-local temporary root above.
  await fs.rm(job, { recursive: true, force: true })
}
