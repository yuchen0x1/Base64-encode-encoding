import { describe, it, expect } from 'vitest'
import { createZip, extractZip, readZip } from '../shared/zip.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50

function getCentralEntries(zip) {
  let eocdOffset = -1
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 22 - 0xffff); offset -= 1) {
    if (zip.readUInt32LE(offset) === EOCD_SIG) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) throw new Error('Test ZIP has no EOCD')

  const count = zip.readUInt16LE(eocdOffset + 10)
  const entries = []
  let cursor = zip.readUInt32LE(eocdOffset + 16)
  for (let i = 0; i < count; i += 1) {
    if (zip.readUInt32LE(cursor) !== CENTRAL_SIG) throw new Error('Test ZIP has an invalid central directory')
    entries.push({ offset: cursor })
    cursor += 46 + zip.readUInt16LE(cursor + 28) + zip.readUInt16LE(cursor + 30) + zip.readUInt16LE(cursor + 32)
  }
  return entries
}

function patchCentralEntry(zip, index, { uncompressedSize, checksum } = {}) {
  const entry = getCentralEntries(zip)[index]
  if (uncompressedSize !== undefined) zip.writeUInt32LE(uncompressedSize, entry.offset + 24)
  if (checksum !== undefined) zip.writeUInt32LE(checksum, entry.offset + 16)
  return zip
}

describe('ZIP decompression resource limits', () => {
  it('rejects archives exceeding the entry-count limit', () => {
    const zip = createZip(Array.from({ length: 4097 }, (_, index) => ({
      path: `file-${index}.txt`,
      data: ''
    })))

    expect(() => readZip(zip)).toThrow(/条目数量超过限制/)
  })

  it('accepts a dist-sized update archive within the limits', () => {
    // 当前生产 dist：12 个文件、约 1.2 MB，最大单文件约 345 KiB。
    const fileSizes = [47429, 344837, 89575, 3038, 150722, 60284, 309149, 34664, 176926, 2124, 1096, 805]
    const zip = createZip(fileSizes.map((size, index) => ({
      path: `assets/file-${index}.bin`,
      data: Buffer.alloc(size, index)
    })))
    const entries = readZip(zip)

    expect(entries).toHaveLength(fileSizes.length)
    expect(entries.reduce((total, entry) => total + entry.size, 0)).toBe(fileSizes.reduce((total, size) => total + size, 0))
    expect(Math.max(...entries.map((entry) => entry.size))).toBe(344837)
  })

  it('rejects an entry whose declared uncompressed size exceeds 64 MiB before inflating it', () => {
    const zip = createZip([{ path: 'large.bin', data: Buffer.alloc(128, 0x41) }])
    const centralEntry = getCentralEntries(zip)[0].offset
    expect(zip.readUInt16LE(centralEntry + 10)).toBe(8)
    const localOffset = zip.readUInt32LE(centralEntry + 42)
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
    zip[dataStart] = 0xff // 若提前校验失效，inflate 会因无效 deflate 流报错。
    patchCentralEntry(zip, 0, { uncompressedSize: 64 * 1024 * 1024 + 1 })

    expect(() => readZip(zip)).toThrow(/条目声明的解压后大小超过限制/)
  })

  it('rejects declared aggregate uncompressed size over 128 MiB before inflating entries', () => {
    const zip = createZip([
      { path: 'first.bin', data: Buffer.alloc(128, 0x41) },
      { path: 'second.bin', data: Buffer.alloc(128, 0x42) },
      { path: 'third.bin', data: Buffer.alloc(128, 0x43) }
    ])
    const firstEntry = getCentralEntries(zip)[0].offset
    const firstLocalOffset = zip.readUInt32LE(firstEntry + 42)
    const firstDataStart = firstLocalOffset + 30 + zip.readUInt16LE(firstLocalOffset + 26) + zip.readUInt16LE(firstLocalOffset + 28)
    zip[firstDataStart] = 0xff // 若预检阶段触发 inflate，会先因无效 deflate 流报错。

    const declaredEntrySize = 43 * 1024 * 1024
    patchCentralEntry(zip, 0, { uncompressedSize: declaredEntrySize })
    patchCentralEntry(zip, 1, { uncompressedSize: declaredEntrySize })
    patchCentralEntry(zip, 2, { uncompressedSize: declaredEntrySize })

    expect(() => readZip(zip)).toThrow(/累计解压后大小超过限制/)
  })

  it('limits actual inflate output to the declared size', () => {
    const zip = createZip([{ path: 'bomb.bin', data: Buffer.alloc(1024 * 1024, 0x41) }])
    patchCentralEntry(zip, 0, { uncompressedSize: 32 })

    try {
      readZip(zip)
      throw new Error('Expected inflate output to be limited')
    } catch (error) {
      expect(error.code).toBe('ERR_BUFFER_TOO_LARGE')
    }
  })

  it('rejects a non-empty payload declared as size zero', () => {
    const zip = createZip([{ path: 'not-empty.bin', data: 'x' }])
    patchCentralEntry(zip, 0, { uncompressedSize: 0 })

    expect(() => readZip(zip)).toThrow(/条目大小校验失败/)
  })

  it('checks a CRC field whose declared value is zero', () => {
    const zip = createZip([{ path: 'crc.bin', data: 'not an empty file' }])
    patchCentralEntry(zip, 0, { checksum: 0 })

    expect(() => readZip(zip)).toThrow(/条目 CRC 校验失败/)
  })

  it('accepts a genuinely empty entry with its valid zero size and CRC', () => {
    const entries = readZip(createZip([{ path: 'empty.bin', data: Buffer.alloc(0) }]))

    expect(entries).toHaveLength(1)
    expect(entries[0].size).toBe(0)
    expect(entries[0].data).toEqual(Buffer.alloc(0))
  })

  it('applies declared-size limits through extractZip before creating its target', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'tbzip-limits-'))
    const targetDir = path.join(parent, 'extracted')
    const zip = createZip([{ path: 'large.bin', data: 'x' }])
    patchCentralEntry(zip, 0, { uncompressedSize: 64 * 1024 * 1024 + 1 })

    try {
      await expect(extractZip(zip, targetDir)).rejects.toThrow(/条目声明的解压后大小超过限制/)
      await expect(fs.access(targetDir)).rejects.toThrow()
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  })
})
