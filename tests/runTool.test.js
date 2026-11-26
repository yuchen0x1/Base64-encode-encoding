import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveToolEntry, runTool } from '../scripts/run-tool.mjs'

let fixture
let root

beforeEach(async () => {
  fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'geek-run-tool-'))
  root = path.join(fixture, 'workspace & (spaces) %PATH%')
  const packageRoot = path.join(root, 'node_modules', 'fixture-cli')
  await fs.mkdir(packageRoot, { recursive: true })
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'fixture-cli', bin: { 'fixture-cli': './fake cli.mjs' } }))
  await fs.writeFile(path.join(packageRoot, 'fake cli.mjs'), `
import fs from 'node:fs'
if (process.argv.includes('--fail')) process.exit(7)
fs.writeFileSync(process.argv[2], JSON.stringify({ args: process.argv.slice(3), cwd: process.cwd(), env: process.env.TOOLBOX_RUN_TEST }))
`)
})

afterEach(async () => {
  await fs.rm(fixture, { recursive: true, force: true })
})

describe('release tool processes', () => {
  it('preserves spaces and shell metacharacters as literal process arguments', async () => {
    const output = path.join(root, 'captured args.json')
    const args = [
      '--config.directories.output=C:\\build folder\\with & (brackets) %PATH% !literal! ^caret',
      '& echo injected > injected.txt',
      'literal | pipe && echo more',
      'a"quoted"argument',
      'trailing\\',
      ''
    ]
    await runTool('fixture-cli', [output, ...args], { cwd: root, env: { ...process.env, TOOLBOX_RUN_TEST: 'unchanged & %PATH%' }, stdio: 'ignore' })
    expect(JSON.parse(await fs.readFile(output, 'utf8'))).toEqual({ args, cwd: root, env: 'unchanged & %PATH%' })
    await expect(fs.stat(path.join(root, 'injected.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('propagates a failed CLI exit rather than proceeding with a release', async () => {
    await expect(runTool('fixture-cli', ['--fail'], { cwd: root, stdio: 'ignore' })).rejects.toThrow('退出码 7')
  })

  it('resolves the actual Vite and electron-builder CLI declarations', async () => {
    for (const tool of ['vite', 'electron-builder']) {
      const entry = resolveToolEntry(tool)
      expect(path.isAbsolute(entry)).toBe(true)
      expect((await fs.stat(entry)).isFile()).toBe(true)
      await runTool(tool, ['--version'], { stdio: 'ignore' })
    }
  }, 20000)
})
