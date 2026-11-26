import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyPayload } from '../electron/installer-verification.js'

function archiveBuffer(packageJson, entry = {}) {
  const headerJson = Buffer.from(JSON.stringify({
    files: { 'package.json': { size: packageJson.length, offset: '0', ...entry } }
  }))
  const header = Buffer.alloc(8 + headerJson.length)
  header.writeUInt32LE(header.length - 4, 0)
  header.writeUInt32LE(headerJson.length, 4)
  headerJson.copy(header, 8)
  const prefix = Buffer.alloc(8)
  prefix.writeUInt32LE(header.length, 4)
  return Buffer.concat([prefix, header, ...(entry.unpacked ? [] : [packageJson])])
}

describe('installer payload verification', () => {
  it('checks the archive size on the opened file even if the path changes before open', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    const asarPath = path.join(root, 'resources', 'app.asar')
    const openSync = fs.openSync
    let replaced = false
    let spy
    try {
      fs.mkdirSync(path.join(root, 'resources'))
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      fs.writeFileSync(asarPath, Buffer.alloc(16))
      const archive = archiveBuffer(Buffer.from(JSON.stringify({ version: '1.2.3' })))
      spy = vi.spyOn(fs, 'openSync').mockImplementation((file, ...args) => {
        if (file === asarPath && args[0] === 'r' && !replaced) {
          replaced = true
          fs.writeFileSync(asarPath, archive)
        }
        return openSync(file, ...args)
      })
      expect(verifyPayload(root, 'GeekToolbox.exe', '1.2.3')).toMatchObject({ ok: true, installedVersion: '1.2.3' })
      expect(replaced).toBe(true)
    } finally {
      spy?.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires unpacked metadata to match the bounded size declared by the archive', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    try {
      fs.mkdirSync(path.join(root, 'resources'))
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      const asarPath = path.join(root, 'resources', 'app.asar')
      const packageJson = Buffer.from(JSON.stringify({ version: '1.2.3' }))
      fs.mkdirSync(`${asarPath}.unpacked`)
      fs.writeFileSync(path.join(`${asarPath}.unpacked`, 'package.json'), packageJson)
      fs.writeFileSync(asarPath, archiveBuffer(packageJson, { unpacked: true }))
      expect(verifyPayload(root, 'GeekToolbox.exe', '1.2.3').ok).toBe(true)

      fs.writeFileSync(asarPath, archiveBuffer(packageJson, { unpacked: true, size: 2 }))
      const result = verifyPayload(root, 'GeekToolbox.exe', '1.2.3')
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('文件大小与归档索引不一致')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects unpacked metadata linked outside the application resources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    try {
      const resources = path.join(root, 'resources')
      const outside = path.join(root, 'outside')
      fs.mkdirSync(resources)
      fs.mkdirSync(outside)
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      const packageJson = Buffer.from(JSON.stringify({ version: '1.2.3' }))
      fs.writeFileSync(path.join(outside, 'package.json'), packageJson)
      fs.writeFileSync(path.join(resources, 'app.asar'), archiveBuffer(packageJson, { unpacked: true }))
      fs.symlinkSync(outside, path.join(resources, 'app.asar.unpacked'), 'junction')

      const result = verifyPayload(root, 'GeekToolbox.exe', '1.2.3')
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('路径超出应用资源目录')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects oversized unpacked metadata before reading its contents', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'toolbox-installer-check-'))
    let spy
    try {
      const resources = path.join(root, 'resources')
      const unpacked = path.join(resources, 'app.asar.unpacked')
      fs.mkdirSync(unpacked, { recursive: true })
      fs.writeFileSync(path.join(root, 'GeekToolbox.exe'), Buffer.alloc(1024 * 1024))
      const packageJson = Buffer.from(JSON.stringify({ version: '1.2.3' }))
      fs.writeFileSync(path.join(resources, 'app.asar'), archiveBuffer(packageJson, { unpacked: true }))
      fs.writeFileSync(path.join(unpacked, 'package.json'), Buffer.alloc(2 * 1024 * 1024))
      spy = vi.spyOn(fs, 'readSync')

      const result = verifyPayload(root, 'GeekToolbox.exe', '1.2.3')
      expect(result.ok).toBe(false)
      expect(result.problems.join(' ')).toContain('文件大小与归档索引不一致')
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      spy?.mockRestore()
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

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
