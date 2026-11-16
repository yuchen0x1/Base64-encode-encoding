export function parseUnixTimestamp(rawValue, unit = 's') {
  if (unit !== 's' && unit !== 'ms') {
    return { valid: false, error: '不支持的时间戳单位' }
  }

  const raw = String(rawValue ?? '').trim()
  if (!/^[+-]?\d+$/.test(raw)) {
    return { valid: false, error: '无效的时间戳格式' }
  }

  const value = Number(raw)
  if (!Number.isSafeInteger(value)) {
    return { valid: false, error: '时间戳超出安全整数范围' }
  }

  const milliseconds = unit === 's' ? value * 1000 : value
  if (!Number.isSafeInteger(milliseconds)) {
    return { valid: false, error: '时间戳超出安全整数范围' }
  }

  const date = new Date(milliseconds)
  if (!Number.isFinite(date.getTime())) {
    return { valid: false, error: '时间戳超出有效范围' }
  }

  return { valid: true, value, milliseconds, date }
}
