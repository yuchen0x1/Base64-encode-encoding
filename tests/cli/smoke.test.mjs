import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { after, test } from 'node:test'

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const scratch = mkdtempSync(path.join(tmpdir(), 'geek-cli-'))
const fileName = `GeekToolbox-CLI-${version}.mjs`
const cli = path.join(scratch, fileName)
copyFileSync(fileURLToPath(new URL(`../../dist-cli/${fileName}`, import.meta.url)), cli)
after(() => rmSync(scratch, { recursive: true, force: true }))

function run(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8', cwd: scratch, timeout: 10_000 })
  if (result.error) throw result.error
  return result
}

test('standalone artifact reports the shared version', () => {
  const result = run(['--version'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), version)
})

test('piped binary follows the same byte-preserving recipe as the desktop tool', () => {
  const data = Buffer.from([255, 0, 254, 128])
  const result = run(['run', '--step', 'base64-decode', '--step', 'sha256'], data.toString('base64'))
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, createHash('sha256').update(data).digest('hex'))
})

test('a saved desktop recipe accepts a file path containing spaces', () => {
  writeFileSync(path.join(scratch, 'recipe.json'), JSON.stringify({
    kind: 'geek-toolbox-batch-recipe', version: 1, steps: ['json-minify'], options: {}
  }))
  writeFileSync(path.join(scratch, 'my input.json'), '{ "id": 9007199254740993 }')
  const result = run(['run', '--recipe', 'recipe.json', '--input', 'my input.json'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, '{"id":9007199254740993}')
})

test('a failed step emits no transformed content and exits nonzero', () => {
  const result = run(['run', '--step', 'base64-decode'], '!!!!')
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Base64/)
})

test('mixed recipe sources are rejected before reading input', () => {
  const result = run(['run', '--recipe', 'recipe.json', '--step', 'sha256'])
  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Choose either/)
})
