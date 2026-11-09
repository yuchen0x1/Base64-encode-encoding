/**
 * 零依赖 ZIP 读写（Node 端使用，供更新服务端 / Electron 主进程 / 发布脚本共用）
 * - createZip: 生成标准 ZIP（deflate，必要时回退 stored），UTF-8 文件名标记
 * - readZip: 解析 ZIP（支持 stored / deflate），校验 CRC 与大小
 * - extractZip: 解压到目录，内置 zip-slip 路径穿越防护
 * 说明：不支持 ZIP64 与加密压缩包（本项目更新包体积远小于 4GB）。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const UTF8_FLAG = 0x0800

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { dosTime, dosDate }
}

function normalizeEntryPath(input) {
  const name = String(input).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!name || name.includes('\u0000')) throw new Error(`非法的压缩包条目路径: ${input}`)
  const segments = name.split('/')
  if (segments.some((seg) => seg === '..')) throw new Error(`压缩包条目包含路径穿越: ${input}`)
  return name
}

export function createZip(files, options = {}) {
  const { mtime = new Date(), compress = true } = options
  const { dosTime, dosDate } = toDosDateTime(mtime)
  const central = []
  const chunks = []
  let offset = 0

  for (const file of files) {
    const name = normalizeEntryPath(file.path)
    const nameBuf = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8')
    const checksum = crc32(data)

    let method = 0
    let payload = data
    if (compress && data.length > 32) {
      const deflated = zlib.deflateRawSync(data, { level: 9 })
      if (deflated.length < data.length) {
        method = 8
        payload = deflated
      }
    }

    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOCAL_SIG, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(UTF8_FLAG, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuf, payload)
    central.push({ nameBuf, method, checksum, csize: payload.length, usize: data.length, offset })
    offset += local.length + nameBuf.length + payload.length
  }

  const centralChunks = []
  let centralSize = 0
  for (const entry of central) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(CENTRAL_SIG, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(UTF8_FLAG, 8)
    header.writeUInt16LE(entry.method, 10)
    header.writeUInt16LE(dosTime, 12)
    header.writeUInt16LE(dosDate, 14)
    header.writeUInt32LE(entry.checksum, 16)
    header.writeUInt32LE(entry.csize, 20)
    header.writeUInt32LE(entry.usize, 24)
    header.writeUInt16LE(entry.nameBuf.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(entry.offset, 42)
    centralChunks.push(header, entry.nameBuf)
    centralSize += header.length + entry.nameBuf.length
  }

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(EOCD_SIG, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(central.length, 8)
  eocd.writeUInt16LE(central.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, ...centralChunks, eocd])
}

function decodeName(buffer) {
  const utf8 = buffer.toString('utf8')
  // 非 UTF-8 字节解码后会出现替换字符，回退 latin1 保证可读
  return utf8.includes('\uFFFD') ? buffer.toString('latin1') : utf8
}

function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff)
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i
  }
  throw new Error('不是有效的 ZIP 文件：未找到中央目录结束标记')
}

export function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('ZIP 数据为空或过短')
  const eocdOffset = findEocd(buffer)
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const centralSize = buffer.readUInt32LE(eocdOffset + 12)
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16)

  if (totalEntries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error('暂不支持 ZIP64 格式的更新包')
  }
  if (centralOffset + centralSize > buffer.length) throw new Error('ZIP 中央目录越界，文件可能已损坏')

  const entries = []
  let cursor = centralOffset
  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIG) throw new Error('ZIP 中央目录结构损坏')
    const flags = buffer.readUInt16LE(cursor + 8)
    const method = buffer.readUInt16LE(cursor + 10)
    const checksum = buffer.readUInt32LE(cursor + 16)
    const csize = buffer.readUInt32LE(cursor + 20)
    const usize = buffer.readUInt32LE(cursor + 24)
    const nameLen = buffer.readUInt16LE(cursor + 28)
    const extraLen = buffer.readUInt16LE(cursor + 30)
    const commentLen = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const rawName = buffer.subarray(cursor + 46, cursor + 46 + nameLen)
    const name = normalizeEntryPath((flags & UTF8_FLAG) ? rawName.toString('utf8') : decodeName(rawName))

    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) throw new Error(`ZIP 条目头损坏: ${name}`)
    const localNameLen = buffer.readUInt16LE(localOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    if (dataStart + csize > buffer.length) throw new Error(`ZIP 条目数据越界: ${name}`)

    const raw = buffer.subarray(dataStart, dataStart + csize)
    let data
    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = zlib.inflateRawSync(raw)
    else throw new Error(`不支持的压缩算法 ${method}: ${name}`)

    if (usize && data.length !== usize) throw new Error(`ZIP 条目大小校验失败: ${name}`)
    if (checksum && crc32(data) !== checksum) throw new Error(`ZIP 条目 CRC 校验失败: ${name}`)

    if (!name.endsWith('/')) entries.push({ path: name, data, size: data.length })
    cursor += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function safeJoin(root, entryPath) {
  const target = path.resolve(root, entryPath)
  const rootResolved = path.resolve(root)
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
    throw new Error(`拒绝解压到目标目录之外: ${entryPath}`)
  }
  return target
}

export async function extractZip(buffer, targetDir) {
  const entries = readZip(buffer)
  await fs.mkdir(targetDir, { recursive: true })
  // Electron 主进程会把 *.asar 当归档拦截写入，更新包内恰好包含 resources/app.asar，
  // 这里临时关闭 asar 支持，保证按普通文件写出（纯 Node 环境下该字段为 undefined）。
  const previousNoAsar = process.noAsar
  if (previousNoAsar === false) process.noAsar = true
  try {
    for (const entry of entries) {
      const target = safeJoin(targetDir, entry.path)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (target.toLowerCase().endsWith('.asar')) {
        // 某些环境（Electron/安全代理）会拦截直接写 *.asar。
        // 先写临时文件再改名，仍保持最终文件名为 app.asar。
        const temp = `${target}.writing-${process.pid}`
        await fs.writeFile(temp, entry.data)
        await fs.rename(temp, target)
      } else {
        await fs.writeFile(target, entry.data)
      }
    }
  } finally {
    if (previousNoAsar === false) process.noAsar = previousNoAsar
  }
  return entries
}

export async function zipDirectory(dir, options = {}) {
  const { prefix = '', skip = [] } = options
  const files = []
  async function walk(current, relative) {
    const items = await fs.readdir(current, { withFileTypes: true })
    for (const item of items) {
      if (skip.includes(item.name)) continue
      const abs = path.join(current, item.name)
      const rel = relative ? `${relative}/${item.name}` : item.name
      if (item.isDirectory()) await walk(abs, rel)
      else if (item.isFile()) files.push({ path: prefix ? `${prefix}/${rel}` : rel, data: await fs.readFile(abs) })
    }
  }
  await walk(dir, '')
  files.sort((a, b) => (a.path < b.path ? -1 : 1))
  return { buffer: createZip(files, options), files }
}
