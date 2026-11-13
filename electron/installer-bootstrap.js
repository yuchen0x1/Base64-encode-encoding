import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const RUNTIME_DATA_FILES = ['icudtl.dat', 'snapshot_blob.bin', 'v8_context_snapshot.bin']

export async function prepareInstallerRuntime(sourceExe, runtimeExe) {
  const sourceDir = path.dirname(sourceExe)
  const targetDir = path.dirname(runtimeExe)
  // Missing runtime data must fail while the current app is still open.
  for (const name of RUNTIME_DATA_FILES) {
    const stat = await fs.stat(path.join(sourceDir, name))
    if (!stat.isFile() || stat.size === 0) throw new Error(`更新运行文件缺失：${name}`)
  }
  await fs.mkdir(targetDir, { recursive: true })
  await fs.copyFile(sourceExe, runtimeExe)
  for (const name of RUNTIME_DATA_FILES) await fs.copyFile(path.join(sourceDir, name), path.join(targetDir, name))
  // The copied .js verifier is an ES module, independently of the installed ASAR.
  await fs.writeFile(path.join(targetDir, 'package.json'), '{"type":"module"}\n', 'utf8')
}

export function startInstallerHelper(runtimeExe, args, expectedVersion, {
  spawnImpl = spawn, timeoutMs = 15000, env = process.env
} = {}) {
  return new Promise((resolve, reject) => {
    let child
    let timer
    let settled = false
    const fail = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child?.kill()
      reject(error)
    }
    const childEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' }
    delete childEnv.NODE_OPTIONS
    try {
      child = spawnImpl(runtimeExe, args, {
        cwd: path.dirname(runtimeExe), detached: true, windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: childEnv
      })
      child.once('error', error => fail(new Error(`更新助手无法启动：${error.message}`)))
      child.once('exit', (code, signal) => fail(new Error(`更新助手尚未就绪便退出（${signal || code}），应用未退出；请查看更新日志或手动安装`)))
      child.on('message', message => {
        if (settled || message?.type !== 'installer-helper-ready') return
        if (message.version !== expectedVersion) { fail(new Error('更新助手目标版本不一致')); return }
        settled = true
        clearTimeout(timer)
        if (child.connected) child.disconnect()
        child.unref()
        resolve(child)
      })
      timer = setTimeout(() => fail(new Error('更新助手启动超时，应用未退出，请重试或手动安装')), timeoutMs)
    } catch (error) { fail(error) }
  })
}
