#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const problems = []
let checkedLinks = 0

function markdownFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'release' || entry.name === 'dist') continue
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...markdownFiles(absolute))
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute)
  }
  return files
}

function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, '')
}

for (const file of markdownFiles(root)) {
  const relativeFile = path.relative(root, file)
  const source = stripCodeFences(readFileSync(file, 'utf8'))
  const links = source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)
  for (const match of links) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (!rawTarget || /^(?:https?:|mailto:|tel:|data:|#)/i.test(rawTarget)) continue
    const target = decodeURIComponent(rawTarget.split('#')[0].split('?')[0])
    if (!target) continue
    const absolute = path.resolve(path.dirname(file), target)
    checkedLinks += 1
    if (!existsSync(absolute)) {
      problems.push(`${relativeFile}: missing local link/image ${rawTarget}`)
      continue
    }
    if (target.endsWith('/') && !statSync(absolute).isDirectory()) {
      problems.push(`${relativeFile}: expected a directory for ${rawTarget}`)
    }
  }
}

const readme = readFileSync(path.join(root, 'README.md'), 'utf8')
const expectedRelease = `https://github.com/yuchen0x1/Base64-encode-encoding/releases/tag/v${pkg.version}`
if (!readme.includes(expectedRelease)) {
  problems.push(`README.md: missing current release link ${expectedRelease}`)
}

const cliDoc = readFileSync(path.join(root, 'docs/CLI.md'), 'utf8')
const staleCliVersion = cliDoc.match(/GeekToolbox-CLI-\d+\.\d+\.\d+\.mjs/)
if (staleCliVersion) {
  problems.push(`docs/CLI.md: hard-coded release name ${staleCliVersion[0]}; use the latest-release download flow instead`)
}

if (problems.length) {
  console.error(`FAIL: documentation check found ${problems.length} problem(s):`)
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log(`PASS: ${checkedLinks} local documentation links/images and README v${pkg.version} release link are valid`)
