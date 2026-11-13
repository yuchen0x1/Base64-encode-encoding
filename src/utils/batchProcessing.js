import CryptoJS from 'crypto-js'
import { formatJsonText } from './jsonText.js'

export const BATCH_LIMITS = Object.freeze({
  rows: 1000,
  lineBytes: 2 * 1024 * 1024,
  fileBytes: 64 * 1024 * 1024,
  totalBytes: 128 * 1024 * 1024,
  outputBytes: 96 * 1024 * 1024,
  totalOutputBytes: 128 * 1024 * 1024,
  steps: 8,
  recipeBytes: 16 * 1024
})

export const BATCH_OPERATIONS = [
  { group: '编码 / 解码', items: [
    { value: 'base64-encode', label: 'Base64 编码' },
    { value: 'base64-decode', label: 'Base64 解码' },
    { value: 'url-encode', label: 'URL 编码' },
    { value: 'url-decode', label: 'URL 解码' }
  ] },
  { group: '摘要哈希', items: [
    { value: 'md5', label: 'MD5 摘要' },
    { value: 'sha1', label: 'SHA-1 摘要' },
    { value: 'sha256', label: 'SHA-256 摘要' }
  ] },
  { group: 'JSON', items: [
    { value: 'json-format', label: 'JSON 格式化' },
    { value: 'json-minify', label: 'JSON 压缩' }
  ] }
]

const labels = Object.fromEntries(BATCH_OPERATIONS.flatMap(group => group.items).map(op => [op.value, op.label]))
export const batchOperationLabel = operation => labels[operation] || operation

// Copy only the versioned allowlist. Neither input data nor executable operations
// can be smuggled into exported/imported recipes through extra object properties.
export function createBatchRecipe(steps, options = {}) {
  if (!Array.isArray(steps) || !steps.length || steps.length > BATCH_LIMITS.steps) {
    throw new Error(`处理流程需要 1–${BATCH_LIMITS.steps} 个步骤`)
  }
  for (const step of steps) {
    if (typeof step !== 'string' || !Object.hasOwn(labels, step)) throw new Error('配方包含不支持的处理步骤')
  }
  for (const key of ['urlSafeBase64', 'upperHash', 'skipEmpty']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error('配方选项必须是布尔值')
  }
  return {
    kind: 'geek-toolbox-batch-recipe', version: 1, steps: [...steps],
    options: {
      urlSafeBase64: options.urlSafeBase64 ?? false,
      upperHash: options.upperHash ?? false,
      skipEmpty: options.skipEmpty ?? true
    }
  }
}

export function parseBatchRecipe(text) {
  if (new TextEncoder().encode(text).length > BATCH_LIMITS.recipeBytes) throw new Error('配方文件不能超过 16 KB')
  let data
  try { data = JSON.parse(text) } catch { throw new Error('配方不是有效的 JSON 文件') }
  if (data?.kind !== 'geek-toolbox-batch-recipe' || data.version !== 1) throw new Error('不支持的配方格式或版本')
  if (!data.options || typeof data.options !== 'object' || Array.isArray(data.options)) throw new Error('配方缺少有效选项')
  return createBatchRecipe(data.steps, data.options)
}

function decodeText(bytes) {
  try {
    // Preserve BOM bytes through encode/decode chains. JSON alone tolerates a BOM.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new Error('内容不是有效的 UTF-8 文本；二进制数据请使用哈希或 Base64 编码')
  }
}

function encodeBase64(bytes, urlSafe) {
  if (Math.ceil(bytes.length / 3) * 4 > BATCH_LIMITS.outputBytes) throw new Error('编码结果超过 96 MB 限制')
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const encoded = btoa(binary)
  return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded
}

function decodeBase64(text) {
  const clean = text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const digits = clean.replace(/=+$/, '')
  const padding = clean.length - digits.length
  const remainder = digits.length % 4
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || remainder === 1 ||
      (padding > 0 && (clean.length % 4 !== 0 || padding !== (4 - remainder) % 4))) {
    throw new Error('无效的 Base64 字符、长度或填充')
  }
  const binary = atob(digits + '='.repeat((4 - remainder) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

// Byte values stay bytes between steps: Base64-decode -> SHA-256 hashes the
// original binary, not UTF-8 replacement characters or a re-encoded string.
export function executeBatchRecipe(input, value) {
  const recipe = createBatchRecipe(value.steps, value.options)
  let bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input))
  if (bytes.length > BATCH_LIMITS.fileBytes) throw new Error('单条输入超过 64 MB 限制')
  let output = ''
  for (const [index, operation] of recipe.steps.entries()) {
    try {
      if (operation === 'base64-decode') {
        bytes = decodeBase64(decodeText(bytes))
      } else {
        if (operation === 'base64-encode') output = encodeBase64(bytes, recipe.options.urlSafeBase64)
        else if (['md5', 'sha1', 'sha256'].includes(operation)) {
          const hash = { md5: CryptoJS.MD5, sha1: CryptoJS.SHA1, sha256: CryptoJS.SHA256 }[operation]
          output = hash(CryptoJS.lib.WordArray.create(bytes)).toString(CryptoJS.enc.Hex)
          if (recipe.options.upperHash) output = output.toUpperCase()
        } else {
          const text = decodeText(bytes)
          if (operation === 'url-encode') output = encodeURIComponent(text)
          else if (operation === 'url-decode') output = decodeURIComponent(text)
          else output = formatJsonText(text, operation === 'json-format')
        }
        bytes = new TextEncoder().encode(output)
      }
      if (bytes.length > BATCH_LIMITS.outputBytes) throw new Error('中间结果超过 96 MB 限制')
      if (index === recipe.steps.length - 1) output = decodeText(bytes)
    } catch (cause) {
      throw new Error(`第 ${index + 1} 步「${batchOperationLabel(operation)}」：${cause.message}`, { cause })
    }
  }
  return output
}

export function csvSafeCell(value) {
  let text = String(value ?? '')
  // Quote all cells and neutralize spreadsheet formula/control prefixes,
  // including full-width variants and formulas hidden behind whitespace.
  // eslint-disable-next-line no-control-regex -- Detect control bytes hiding a formula prefix.
  if (/^[\s\u0000-\u001f]*[=+\-@＝＋－＠]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text
  return `"${text.replace(/"/g, '""')}"`
}

export function batchResultsCsv(rows) {
  const header = ['序号', '来源', '状态', '结果', '错误']
  const cells = rows.map(row => [row.index, row.source, row.ok ? '成功' : '失败', row.ok ? row.output : '', row.ok ? '' : row.error])
  return '\uFEFF' + [header, ...cells].map(row => row.map(csvSafeCell).join(',')).join('\r\n')
}

export function createBatchExport(rows, snapshot, status) {
  const recipe = createBatchRecipe(snapshot.recipe.steps, snapshot.recipe.options)
  return {
    operation: recipe.steps.join(' → '),
    recipe,
    generatedAt: new Date().toISOString(),
    startedAt: snapshot.startedAt,
    sourceMode: snapshot.sourceMode,
    status,
    requestedTotal: snapshot.total,
    total: rows.length,
    rows: rows.map(row => ({
      index: row.index, source: row.source, ok: row.ok,
      output: row.ok ? row.output : null, error: row.ok ? null : row.error
    }))
  }
}
