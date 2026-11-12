const sqlTokens = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`/g
const clauseBreaks = /\s+(?=(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|UNION|VALUES|SET)\b)/gi

function transformSqlOutsideStrings(sql, transform, removeComments = false) {
  const parts = []
  let plainText = ''
  let lastIndex = 0

  for (const match of sql.matchAll(sqlTokens)) {
    plainText += sql.slice(lastIndex, match.index)
    const token = match[0]
    const isComment = token.startsWith('--') || token.startsWith('/*')

    if (isComment) {
      if (!removeComments) plainText += token
      else plainText += ' '
    } else {
      if (plainText) parts.push(transform(plainText))
      plainText = ''
      // Keep quoted strings/identifiers as opaque table entries, not textual
      // placeholders, so no user input can collide with a restoration token.
      parts.push(token)
    }

    lastIndex = match.index + token.length
  }

  plainText += sql.slice(lastIndex)
  if (plainText) parts.push(transform(plainText))
  return parts.join('')
}

export function formatSqlText(sql) {
  const source = sql.trim()
  if (!source) return sql

  const formatted = transformSqlOutsideStrings(source, text => text
    .replace(/\s+/g, ' ')
    .replace(clauseBreaks, '\n')
    .replace(/\s*,\s*/g, ',\n  ')
    .replace(/\s+AND\s+/gi, '\n  AND ')
    .replace(/\s+OR\s+/gi, '\n  OR ')
    .replace(/\s+((?:LEFT|RIGHT|INNER|OUTER|FULL|CROSS)\s+)?JOIN\s+/gi, (_, prefix = '') => `\n${prefix}JOIN `)
    .replace(/\s+ON\s+/gi, '\n  ON ')
    .replace(/\s+VALUES\s*/gi, '\nVALUES ')
    .replace(/\s+SET\s+/gi, '\nSET ')
    .replace(/\s*;\s*/g, ';\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n'))

  return formatted.trim()
}

export function minifySqlText(sql) {
  const source = sql.trim()
  if (!source) return sql

  return transformSqlOutsideStrings(source, text => text
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;])\s*/g, '$1')
    .trim(), true)
    .replace(/,\s*/g, ', ')
}
