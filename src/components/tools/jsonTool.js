import {
  assertJsonDepth,
  assertJsonNumbersRoundTrip,
  formatJsonText,
  JSON_FORMAT_MAX_LINES
} from '../../utils/jsonText.js'

export const JSON_ADVANCED_MAX_BYTES = 16 * 1024 * 1024
export const JSON_LARGE_DOCUMENT_BYTES = 5 * 1024 * 1024
export const JSON_WORKER_THRESHOLD_BYTES = 1 * 1024 * 1024
export const JSON_MAX_DOCUMENT_BYTES = 32 * 1024 * 1024

export function jsonByteLength(text) {
  return new TextEncoder().encode(String(text ?? '')).byteLength
}

export function assertJsonDocumentSize(text, maxBytes = JSON_ADVANCED_MAX_BYTES) {
  const size = jsonByteLength(text)
  if (size > maxBytes) {
    throw new Error(`JSON 文件超过 ${(maxBytes / 1024 / 1024).toFixed(0)} MiB 上限`)
  }
  return size
}

export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function countJsonKeys(root) {
  let count = 0
  const pending = [root]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue

    if (Array.isArray(value)) {
      count += value.length
      for (let index = 0; index < value.length; index++) {
        const child = value[index]
        if (child && typeof child === 'object') pending.push(child)
      }
      continue
    }

    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      count++
      const child = value[key]
      if (child && typeof child === 'object') pending.push(child)
    }
  }
  return count
}

export { JSON_FORMAT_MAX_LINES }

export function formatJson(text, options) {
  try { return { ok: true, value: formatJsonText(text, true, options) } }
  catch (error) { return { ok: false, error } }
}

export function minifyJson(text) {
  try { return { ok: true, value: formatJsonText(text, false) } }
  catch (error) { return { ok: false, error } }
}

export function parseJsonForMutation(text) {
  try { assertJsonNumbersRoundTrip(text) }
  catch (error) { return { ok: false, error } }
  return parseJson(text)
}

export function parseJsonForStructure(text) {
  try { assertJsonDepth(text) }
  catch (error) { return { ok: false, error } }
  return parseJson(text)
}

/** 从 V8/浏览器 JSON 错误中提取行列，并给出可读位置描述。 */
export function locateJsonError(text, error) {
  const source = String(text ?? '')
  const message = String(error?.message || error || 'JSON 解析失败')
  let position = Number(message.match(/position\s+(\d+)/i)?.[1])
  let line = Number(message.match(/line\s+(\d+)/i)?.[1])
  let column = Number(message.match(/column\s+(\d+)/i)?.[1])

  if (!Number.isSafeInteger(position) && Number.isSafeInteger(line) && Number.isSafeInteger(column)) {
    const lines = source.split(/\r?\n/)
    position = lines.slice(0, Math.max(0, line - 1)).reduce((total, value) => total + value.length + 1, 0) + Math.max(0, column - 1)
  }
  if (!Number.isSafeInteger(line) && Number.isSafeInteger(position)) {
    position = Math.min(Math.max(0, position), source.length)
    const before = source.slice(0, position)
    const matches = [...before.matchAll(/\n/g)]
    line = matches.length + 1
    column = position - (matches.length ? matches.at(-1).index + 1 : 0) + 1
  }
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(column)) {
    // End-of-input errors on valid non-empty prefixes point at the end.
    if (source.length && /end of json input|unexpected end/i.test(message)) {
      const lines = source.split(/\r?\n/)
      const lastLineIndex = lines.length - 1
      const lastLine = lines[lastLineIndex]
      return {
        message,
        line: lastLineIndex + 1,
        column: lastLine.length + 1,
        position: source.length,
        lineText: lastLine
      }
    }
    return { message, line: null, column: null, position: null, lineText: '' }
  }
  const lineText = source.split(/\r?\n/)[line - 1] || ''
  return { message, line, column, position, lineText }
}

export function formatJsonError(text, error) {
  const location = locateJsonError(text, error)
  if (!location.line) return location.message
  return `${location.message}（第 ${location.line} 行，第 ${location.column} 列）`
}

export function formatJsonValuePreview(value, maxChars = 240) {
  const serialized = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value, null, 2)
  if (serialized === undefined) return String(value)
  return serialized.length > maxChars ? `${serialized.slice(0, maxChars)}…` : serialized
}

export function unescapeJsonString(text) {
  const result = parseJson(text)
  if (!result.ok) return result
  if (typeof result.value !== 'string') {
    return { ok: false, error: new TypeError('JSON value must be a string') }
  }
  return result
}

function createJsonObject() {
  return Object.create(null)
}

export function sortJsonObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortJsonObjectKeys)
  if (value && typeof value === 'object') {
    const result = createJsonObject()
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      result[key] = sortJsonObjectKeys(value[key])
    }
    return result
  }
  return value
}

export function removeEmptyJsonValues(value) {
  if (Array.isArray(value)) {
    return value
      .map(removeEmptyJsonValues)
      .filter(item => item !== null && item !== undefined && item !== '')
  }
  if (value && typeof value === 'object') {
    const result = createJsonObject()
    for (const key of Object.keys(value)) {
      const next = removeEmptyJsonValues(value[key])
      if (next !== null && next !== undefined && next !== '') result[key] = next
    }
    return result
  }
  return value
}

const TYPE_SCRIPT_KEYWORDS = new Set([
  'any', 'boolean', 'break', 'constructor', 'continue', 'declare', 'delete', 'do', 'else', 'enum',
  'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'default',
  'in', 'instanceof', 'interface', 'keyof', 'let', 'module', 'namespace', 'never', 'new',
  'null', 'number', 'object', 'package', 'private', 'protected', 'public', 'readonly', 'return',
  'static', 'string', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof',
  'undefined', 'unique', 'unknown', 'var', 'void', 'while', 'with', 'yield'
])

function toTypeName(key) {
  const cleaned = key.replace(/[^a-zA-Z0-9_$]/g, '_')
  const base = /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned || 'Root'
  return base === 'RootData' ? `${base}Type` : base
}

function formatPropertyName(key) {
  const identifier = /^[$A-Z_a-z][$\w]*$/.test(key)
  return identifier && !TYPE_SCRIPT_KEYWORDS.has(key) ? key : JSON.stringify(key)
}

export function generateTypeScript(value) {
  const interfaces = new Map()
  const typeNames = new Map()
  const usedTypeNames = new Set(['RootData'])

  function allocateTypeName(name) {
    if (typeNames.has(name)) return typeNames.get(name)

    const base = toTypeName(name)
    let candidate = base
    let suffix = 2
    while (usedTypeNames.has(candidate)) {
      candidate = `${base}_${suffix}`
      suffix += 1
    }
    typeNames.set(name, candidate)
    usedTypeNames.add(candidate)
    return candidate
  }

  function inferType(current, name) {
    if (current === null) return 'unknown'
    if (Array.isArray(current)) {
      if (!current.length) return 'unknown[]'
      const types = [...new Set(current.map(item => inferType(item, `${name}Item`)))]
      return types.length === 1 ? `${types[0]}[]` : `(${types.join(' | ')})[]`
    }
    if (typeof current === 'object') {
      const interfaceName = allocateTypeName(name)
      let definition = interfaces.get(interfaceName)
      if (!definition) {
        definition = { name: interfaceName, instances: 0, fields: new Map() }
        interfaces.set(interfaceName, definition)
      }
      definition.instances++

      for (const [key, item] of Object.entries(current)) {
        const fieldName = formatPropertyName(key)
        let field = definition.fields.get(fieldName)
        if (!field) {
          field = { present: 0, nullable: false, types: new Set() }
          definition.fields.set(fieldName, field)
        }
        field.present++
        field.nullable ||= item === null
        field.types.add(inferType(item, `${interfaceName}${toTypeName(key)}`))
      }
      return interfaceName
    }
    if (typeof current === 'number') return 'number'
    if (typeof current === 'boolean') return 'boolean'
    return 'string'
  }

  const rootType = inferType(value, 'Root')
  const declarations = [...interfaces.values()].reverse().map(definition => {
    const fields = [...definition.fields].map(([key, field]) => {
      const optional = field.nullable || field.present < definition.instances ? '?' : ''
      return `  ${key}${optional}: ${[...field.types].join(' | ')};`
    })
    return `export interface ${definition.name} {\n${fields.join('\n')}\n}`
  })

  return `${declarations.join('\n\n')}\n\nexport type RootData = ${rootType}`
}
