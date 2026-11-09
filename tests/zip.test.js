import { describe, it, expect } from 'vitest'
import { crc32, createZip, readZip, extractZip } from '../shared/zip.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

describe('crc32', () => {
  it('matches the standard check value for "123456789"', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xCBF43926)
  })
})

describe('createZip / readZip', () => {
  it('round-trips a single UTF-8 file', () => {
    const buf = createZip([{ path: 'hello.txt', data: '你好，世界' }])
    const entries = readZip(buf)
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe('hello.txt')
    expect(entries[0].data.toString('utf8')).toBe('你好，世界')
  })
  it('round-trips multiple files including binary', () => {
    const buf = createZip([
      { path: 'a.txt', data: 'A' },
      { path: 'dir/b.bin', data: Buffer.from([0, 1, 2, 3, 255]) }
    ])
    const entries = readZip(buf)
    expect(entries.map((e) => e.path).sort()).toEqual(['a.txt', 'dir/b.bin'])
    const bin = entries.find((e) => e.path === 'dir/b.bin')
    expect(Array.from(bin.data)).toEqual([0, 1, 2, 3, 255])
  })
})

describe('zip-slip protection', () => {
  it('rejects path-traversal entries at creation time', () => {
    expect(() => createZip([{ path: '../escape.txt', data: 'x' }])).toThrow(/路径穿越/)
  })
  it('neutralizes absolute-ish leading entries into contained relative paths', () => {
    const buf = createZip([{ path: '/etc/passwd', data: 'x' }])
    const entries = readZip(buf)
    expect(entries[0].path).toBe('etc/passwd')
  })
})

describe('extractZip', () => {
  it('writes files only under the target directory', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'tbzip-'))
    try {
      const buf = createZip([{ path: 'out.txt', data: 'payload' }])
      const entries = await extractZip(buf, tmp)
      expect(entries).toHaveLength(1)
      const content = await fs.readFile(path.join(tmp, 'out.txt'), 'utf8')
      expect(content).toBe('payload')
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
})
