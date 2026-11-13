import { assertJsonDepth, assertJsonNumbersRoundTrip, formatJsonText } from '../../utils/jsonText.js'

export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error }
  }
}

export function formatJson(text) {
  try { return { ok: true, value: formatJsonText(text) } }
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
