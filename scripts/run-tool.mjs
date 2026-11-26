import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

export function resolveToolEntry(tool, cwd = process.cwd()) {
  const require = createRequire(path.join(path.resolve(cwd), 'package.json'))
  const metadataPath = require.resolve(`${tool}/package.json`)
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
  const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.[tool]
  if (typeof bin !== 'string' || !bin) throw new Error(`${tool} 未声明 CLI 入口`)
  return require.resolve(path.resolve(path.dirname(metadataPath), bin))
}

export async function runTool(tool, commandArgs, { cwd = process.cwd(), env, stdio = 'inherit' } = {}) {
  const entry = resolveToolEntry(tool, cwd)
  return new Promise((resolve, reject) => {
    // 直接运行已安装的 JavaScript CLI，避免 Windows cmd 重新解释路径和参数。
    const child = spawn(process.execPath, [entry, ...commandArgs], { cwd, env, stdio, shell: false, windowsHide: true })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${tool} 退出码 ${code}${signal ? `，信号 ${signal}` : ''}`))
    })
  })
}
