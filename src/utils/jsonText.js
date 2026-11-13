// Validate with the platform parser, but format original tokens rather than
// serializing JS numbers (which would round 64-bit IDs or turn 1e999 into null).
const TOKEN = /"(?:[^"\\]|\\.)*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:]/g

export function jsonTokens(text) {
  const source = String(text).replace(/^\uFEFF/, '')
  JSON.parse(source)
  return source.match(TOKEN)
}

export function formatJsonText(text, pretty = true) {
  const tokens = jsonTokens(text)
  if (!pretty) return tokens.join('')
  assertDepth(tokens)
  let depth = 0
  const output = []
  const newline = () => output.push('\n', '  '.repeat(depth))
  for (const [index, token] of tokens.entries()) {
    if (token === '{' || token === '[') {
      output.push(token)
      depth++
      if (tokens[index + 1] !== '}' && tokens[index + 1] !== ']') newline()
    } else if (token === '}' || token === ']') {
      depth--
      if (tokens[index - 1] !== '{' && tokens[index - 1] !== '[') newline()
      output.push(token)
    } else if (token === ',') {
      output.push(token)
      newline()
    } else output.push(token === ':' ? ': ' : token)
  }
  return output.join('')
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
  assertDepth(jsonTokens(text))
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
  const tokens = jsonTokens(text)
  assertDepth(tokens)
  const scopes = []
  for (const [index, token] of tokens.entries()) {
    if (token === '{' || token === '[') scopes.push(token === '{' ? new Set() : null)
    else if (token === '}' || token === ']') scopes.pop()
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key = JSON.parse(token)
      const keys = scopes.at(-1)
      if (keys.has(key)) throw new Error('JSON 包含重复键，结构操作可能丢失数据；请先处理重复键或仅使用美化 / 压缩')
      keys.add(key)
    }
    if (!/^-?\d/.test(token)) continue
    const number = Number(token)
    if (!Number.isFinite(number) || decimalIdentity(token) !== decimalIdentity(JSON.stringify(number))) {
      throw new Error('包含无法无损处理的 JSON 数字：请使用美化或压缩，或先将大整数 / 高精度数值改为字符串')
    }
  }
}
