import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

describe('Windows packaging assets', () => {
  it('keeps every package.json asset reference present', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    const files = [packageJson.build.icon, packageJson.build.win.icon, packageJson.build.nsis.include]
    for (const file of new Set(files)) {
      expect(fs.existsSync(path.join(root, file)), file).toBe(true)
    }
  })
})
