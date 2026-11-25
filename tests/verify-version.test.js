import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

it('emits the complete release body including nested template headings', () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/verify-version.mjs'),
    `v${pkg.version}`,
    '--notes'
  ], { cwd: root, encoding: 'utf8' })

  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.startsWith('## 📢 版本概述')).toBe(true)
  expect(result.stdout).toContain('## 📦 下载与安装')
  expect(result.stdout).toContain('## ⚠️ 已知问题')
})
