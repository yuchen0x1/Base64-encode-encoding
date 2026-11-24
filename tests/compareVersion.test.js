import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/compare-version.mjs', import.meta.url))

describe('compare-version CLI', () => {
  it('returns -1, 0, and 1 for release ordering', async () => {
    await expect(execFileAsync(process.execPath, [script, '0.0.11', '0.0.12'])).resolves.toMatchObject({ stdout: '-1\n' })
    await expect(execFileAsync(process.execPath, [script, '0.0.12', 'v0.0.12'])).resolves.toMatchObject({ stdout: '0\n' })
    await expect(execFileAsync(process.execPath, [script, '0.0.13', '0.0.12'])).resolves.toMatchObject({ stdout: '1\n' })
  })

  it('uses semver prerelease ordering rather than a decimal-parsing rejection', async () => {
    await expect(execFileAsync(process.execPath, [script, '0.0.13-rc.1', '0.0.13'])).resolves.toMatchObject({ stdout: '-1\n' })
    await expect(execFileAsync(process.execPath, [script, 'bad', '0.0.12'])).rejects.toThrow()
  })
})
