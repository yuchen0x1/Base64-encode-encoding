// Validate with the platform parser, but format original tokens rather than
// serializing JS numbers (which would round 64-bit IDs or turn 1e999 into null).
const TOKEN = /"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g
const OUTPUT_CHUNK_CHARS = 64 * 1024
export const JSON_FORMAT_MAX_LINES = 100_000

function normalizeJsonSource(text) {
  return String(text).replace(/^\uFEFF/, '')
}

function* scanJsonTokens(source) {
  const pattern = new RegExp(TOKEN.source, 'g')
  let match
  while ((match = pattern.exec(source)) !== null) yield match[0]
}

function createChunkWriter(maxLines = Number.POSITIVE_INFINITY) {
  const chunks = []
  let parts = []
  let length = 0
  let lineCount = 1

  function write(value) {
    if (value.includes('\n')) {
      lineCount += value.split('\n').length - 1
      if (lineCount > maxLines) {
        throw new Error(`JSON 美化结果超过 ${maxLines.toLocaleString('en-US')} 行，为保护界面内存未应用；请先压缩数据或使用批量处理`)
      }
    }
    parts.push(value)
    length += value.length
    if (length >= OUTPUT_CHUNK_CHARS) {
      chunks.push(parts.join(''))
      parts = []
      length = 0
    }
  }

  return {
    write,
    finish() {
      if (parts.length) chunks.push(parts.join(''))
      return chunks.join('')
    }
  }
}

export function jsonTokens(text) {
  const source = normalizeJsonSource(text)
  JSON.parse(source)
  return [...scanJsonTokens(source)]
}

export function formatJsonText(text, pretty = true, { maxLines = Number.POSITIVE_INFINITY } = {}) {
  const source = normalizeJsonSource(text)
  JSON.parse(source)
  const tokens = scanJsonTokens(source)
  const writer = createChunkWriter(pretty ? maxLines : Number.POSITIVE_INFINITY)

  if (!pretty) {
    for (const token of tokens) writer.write(token)
    return writer.finish()
  }

  let depth = 0
  const newline = () => {
    writer.write('\n')
    writer.write('  '.repeat(depth))
  }
  const iterator = tokens[Symbol.iterator]()
  let previous = null
  let current = iterator.next()
  let next = iterator.next()
  while (!current.done) {
    const token = current.value
    if (token === '{' || token === '[') {
      writer.write(token)
      depth++
      if (depth > 256) throw new Error('JSON 嵌套超过 256 层，请减少嵌套或仅使用压缩')
      if (next.value !== '}' && next.value !== ']') newline()
    } else if (token === '}' || token === ']') {
      depth--
      if (previous !== '{' && previous !== '[') newline()
      writer.write(token)
    } else if (token === ',') {
      writer.write(token)
      newline()
    } else writer.write(token === ':' ? ': ' : token)
    previous = token
    current = next
    next = iterator.next()
  }
  return writer.finish()
}

function assertDepth(tokens) {
  let depth = 0
  for (const token of tokens) {
    if (token === '{' || token === '[') depth++
    if (depth > 256) throw new Error('JSON 嵌套超过 256 层，请减少嵌套或仅使用压缩')
    if (token === '}' || token === ']') depth--
  }
}

export function assertJsonDepth(text) {
  const source = normalizeJsonSource(text)
  JSON.parse(source)
  assertDepth(scanJsonTokens(source))
}

function decimalIdentity(value) {
  const [, sign, whole, fraction = '', exponent = '0'] = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value)
  const digits = (whole + fraction).replace(/^0+/, '')
  if (!digits) return sign ? '-0' : '0'
  const significant = digits.replace(/0+$/, '')
  const power = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits.length - significant.length)
  return `${sign}${significant}e${power}`
}

// Structural operations still use JS values. Refuse them when re-serialization
// would change any number, while leaving safe formatting/minification available.
export function assertJsonNumbersRoundTrip(text) {
  const source = normalizeJsonSource(text)
  JSON.parse(source)
  const tokens = scanJsonTokens(source)
  const scopes = []
  const iterator = tokens[Symbol.iterator]()
  let current = iterator.next()
  let next = iterator.next()
  let depth = 0
  while (!current.done) {
    const token = current.value
    if (token === '{' || token === '[') scopes.push(token === '{' ? new Set() : null)
    if (token === '{' || token === '[') {
      depth++
      if (depth > 256) throw new Error('JSON 嵌套超过 256 层，请减少嵌套或仅使用压缩')
    } else if (token === '}' || token === ']') {
      depth--
      scopes.pop()
    }
    if (token.startsWith('"') && next.value === ':') {
      const key = JSON.parse(token)
      const keys = scopes.at(-1)
      if (keys.has(key)) throw new Error('JSON 包含重复键，结构操作可能丢失数据；请先处理重复键或仅使用美化 / 压缩')
      keys.add(key)
    }
    if (/^-?\d/.test(token)) {
      const number = Number(token)
      if (!Number.isFinite(number) || decimalIdentity(token) !== decimalIdentity(JSON.stringify(number))) {
        throw new Error('包含无法无损处理的 JSON 数字：请使用美化或压缩，或先将大整数 / 高精度数值改为字符串')
      }
    }
    current = next
    next = iterator.next()
  }
}
