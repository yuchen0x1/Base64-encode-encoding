/**
 * 语义化版本比较（同时支持 1.2.3 / v1.2.3 / 1.2.3-beta.1+build 形式）
 * 供前端、Electron 主进程、更新服务端和发布脚本共用，避免多处实现不一致。
 */

export function parseVersion(input) {
  if (typeof input !== 'string') return null
  const raw = input.trim().replace(/^v/i, '')
  const match = raw.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  }
}

function comparePrerelease(a, b) {
  // 无预发布标识的版本优先级更高：1.0.0 > 1.0.0-beta
  if (!a.length && !b.length) return 0
  if (!a.length) return 1
  if (!b.length) return -1

  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i += 1) {
    const x = a[i]
    const y = b[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      const diff = Number(x) - Number(y)
      if (diff !== 0) return diff > 0 ? 1 : -1
    } else if (xn !== yn) {
      // 数字标识优先级低于字母标识
      return xn ? -1 : 1
    } else if (x !== y) {
      return x > y ? 1 : -1
    }
  }
  return 0
}

/** 返回 1 表示 a 更新，-1 表示 b 更新，0 表示相同；非法版本抛出异常 */
export function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va) throw new Error(`无法解析版本号: ${a}`)
  if (!vb) throw new Error(`无法解析版本号: ${b}`)
  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1
  return comparePrerelease(va.prerelease, vb.prerelease)
}

export function isNewerVersion(latest, current) {
  try {
    return compareVersions(latest, current) > 0
  } catch {
    return false
  }
}

export function normalizeVersion(input) {
  const parsed = parseVersion(input)
  if (!parsed) return String(input || '').trim()
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  return parsed.prerelease.length ? `${base}-${parsed.prerelease.join('.')}` : base
}
