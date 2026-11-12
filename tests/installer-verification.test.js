import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyPayload } from '../electron/installer-verification.js'

describe('installer payload verification', () => {
  it('accepts an app.asar package.json declaring the exact expected version', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    try {
      fs.mkdirSync(path.join(root, 'resources'))
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      const packageJson = Buffer.from(JSON.stringify({ name: 'geek-toolbox', version: '1.2.3' }))
      const headerJson = Buffer.from(JSON.stringify({
        files: { 'package.json': { size: packageJson.length, offset: '0' } }
      }))
      const headerString = Buffer.alloc(4 + headerJson.length)
      headerString.writeInt32LE(headerJson.length, 0)
      headerJson.copy(headerString, 4)
      const headerPickleSize = Buffer.alloc(4)
      headerPickleSize.writeUInt32LE(headerString.length, 0)
      const headerSize = Buffer.alloc(4)
      headerSize.writeUInt32LE(headerPickleSize.length + headerString.length, 0)
      fs.writeFileSync(path.join(root, 'resources', 'app.asar'), Buffer.concat([
        Buffer.alloc(4),
        headerSize,
        headerPickleSize,
        headerString,
        packageJson
      ]))

      expect(verifyPayload(root, 'GeekToolbox.exe', '1.2.3')).toMatchObject({
        ok: true,
        installedVersion: '1.2.3',
        problems: []
      })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an otherwise present and sufficiently large stale app.asar', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    try {
      fs.mkdirSync(path.join(root, 'resources'))
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      const packageJson = Buffer.from(JSON.stringify({ name: 'geek-toolbox', version: '1.2.2' }))
      const headerJson = Buffer.from(JSON.stringify({
        files: { 'package.json': { size: packageJson.length, offset: '0' } }
      }))
      const headerString = Buffer.alloc(4 + headerJson.length)
      headerString.writeInt32LE(headerJson.length, 0)
      headerJson.copy(headerString, 4)
      const headerPickleSize = Buffer.alloc(4)
      headerPickleSize.writeUInt32LE(headerString.length, 0)
      const headerSize = Buffer.alloc(4)
      headerSize.writeUInt32LE(headerPickleSize.length + headerString.length, 0)
      fs.writeFileSync(path.join(root, 'resources', 'app.asar'), Buffer.concat([
        Buffer.alloc(4),
        headerSize,
        headerPickleSize,
        headerString,
        packageJson
      ]))

      const result = verifyPayload(root, 'GeekToolbox.exe', '1.2.3')
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toMatch(/版本不匹配/)
      expect(result.installedVersion).toBe('1.2.2')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects a missing expected version and corrupt archives', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    try {
      fs.mkdirSync(path.join(root, 'resources'))
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      fs.writeFileSync(path.join(root, 'resources', 'app.asar'), 'not an asar')
      const result = verifyPayload(root, 'GeekToolbox.exe', '1.2.3')
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toMatch(/无法读取/)
      expect(verifyPayload(root, 'GeekToolbox.exe').ok).toBe(false)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
