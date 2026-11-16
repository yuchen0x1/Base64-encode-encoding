import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const requiredFiles = [
  packageJson.build?.icon,
  packageJson.build?.win?.icon,
  packageJson.build?.nsis?.include
].filter(Boolean)
const missing = [...new Set(requiredFiles)].filter(relativePath => {
  return !fs.existsSync(path.join(root, relativePath))
})

if (missing.length) {
  throw new Error(`打包资源缺失：${missing.join(', ')}`)
}

console.log(`PASS: packaging assets ready (${[...new Set(requiredFiles)].join(', ')})`)
