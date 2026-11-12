import fs from 'node:fs'
import path from 'node:path'

const MAX_ASAR_HEADER_SIZE = 16 * 1024 * 1024
const MAX_PACKAGE_JSON_SIZE = 1024 * 1024

/**
 * Read a package.json entry directly from an ASAR archive. This deliberately only
 * supports the fixed metadata path needed by the verifier and keeps the copied
 * installer helper independent of app.asar modules and package resolution.
 */
function readAsarPackageJson(asarPath) {
  const stat = fs.statSync(asarPath)
  if (!stat.isFile() || stat.size < 16) throw new Error('ASAR 文件无效或过短')

  const fd = fs.openSync(asarPath, 'r')
  try {
    const prefix = Buffer.alloc(8)
    if (fs.readSync(fd, prefix, 0, prefix.length, 0) !== prefix.length) {
      throw new Error('无法读取 ASAR 头部长度')
    }

    const headerSize = prefix.readUInt32LE(4)
    if (headerSize < 16 || headerSize > MAX_ASAR_HEADER_SIZE || 8 + headerSize > stat.size) {
      throw new Error('ASAR 头部长度无效')
    }

    const header = Buffer.alloc(headerSize)
    if (fs.readSync(fd, header, 0, header.length, 8) !== header.length) {
      throw new Error('ASAR 头部不完整')
    }
    const headerPickleSize = header.readUInt32LE(0)
    const headerStringLength = header.readUInt32LE(4)
    if (headerPickleSize !== headerSize - 4 || headerStringLength < 2 || headerStringLength > headerSize - 8) {
      throw new Error('ASAR 文件索引无效')
    }

    const index = JSON.parse(header.toString('utf8', 8, 8 + headerStringLength))
    const entry = index?.files?.['package.json']
    if (!entry || entry.files || typeof entry.size !== 'number' || entry.size < 2 || entry.size > MAX_PACKAGE_JSON_SIZE) {
      throw new Error('ASAR 缺少有效的 package.json')
    }

    let packageBuffer
    if (entry.unpacked) {
      const unpackedPath = `${asarPath}.unpacked`
      packageBuffer = fs.readFileSync(path.join(unpackedPath, 'package.json'))
      if (packageBuffer.length > MAX_PACKAGE_JSON_SIZE) throw new Error('package.json 文件过大')
    } else {
      if (typeof entry.offset !== 'string' || !/^\d+$/.test(entry.offset)) {
        throw new Error('ASAR package.json 偏移无效')
      }
      const bodyOffset = 8 + headerSize
      const entryOffset = Number(entry.offset)
      if (!Number.isSafeInteger(entryOffset) || entryOffset < 0 || bodyOffset + entryOffset + entry.size > stat.size) {
        throw new Error('ASAR package.json 超出归档范围')
      }
      packageBuffer = Buffer.alloc(entry.size)
      if (fs.readSync(fd, packageBuffer, 0, packageBuffer.length, bodyOffset + entryOffset) !== packageBuffer.length) {
        throw new Error('ASAR package.json 不完整')
      }
    }

    return JSON.parse(packageBuffer.toString('utf8'))
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Installed payload must include a usable executable and an app.asar whose
 * package metadata declares the exact version this update intends to install.
 */
export function verifyPayload(dir, exeName, expectedVersion) {
  const exePath = path.join(dir, exeName)
  const asarPath = path.join(dir, 'resources', 'app.asar')
  const exeSize = sizeOf(exePath)
  const asarSize = sizeOf(asarPath)
  const problems = []

  if (exeSize < 1024 * 1024) problems.push(`${exeName}=${exeSize < 0 ? '缺失' : exeSize + 'B'}`)
  if (asarSize < 0) problems.push('resources/app.asar=缺失')

  let installedVersion = null
  if (asarSize >= 0) {
    try {
      const packageJson = readAsarPackageJson(asarPath)
      installedVersion = packageJson.version
      if (typeof expectedVersion !== 'string' || !expectedVersion || installedVersion !== expectedVersion) {
        problems.push(`resources/app.asar 版本不匹配（期望 ${expectedVersion || '未知'}，实际 ${installedVersion || '未知'}）`)
      }
    } catch (error) {
      problems.push(`无法读取 resources/app.asar/package.json（${error.message}）`)
    }
  }

  return { ok: problems.length === 0, problems, exePath, asarSize, exeSize, installedVersion }
}

function sizeOf(file) {
  try {
    const stat = fs.statSync(file)
    return stat.isFile() ? stat.size : -1
  } catch {
    return -1
  }
}
