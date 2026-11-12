import { describe, expect, it } from 'vitest'
import { formatSqlText, minifySqlText } from '../src/utils/sqlStringProtection.js'

describe('SQL string protection', () => {
  it('keeps existing placeholder-like text literal during formatting', () => {
    const sql = "SELECT __SQL_STRING_0__ AS existing, 'quoted value' AS literal"
    const formatted = formatSqlText(sql)

    expect(formatted).toContain('__SQL_STRING_0__')
    expect(formatted).toContain("'quoted value'")
  })

  it('keeps quoted text and placeholder-like identifiers during minification', () => {
    const sql = `SELECT __SQL_STRING_0__, 'it''s safe', "quoted identifier", \`tick\``

    expect(minifySqlText(sql)).toBe("SELECT __SQL_STRING_0__, 'it''s safe', \"quoted identifier\", `tick`")
  })

  it('does not treat comment markers inside string literals as comments', () => {
    const sql = "SELECT '-- keep this', '/* keep this */', value -- remove comment"

    expect(minifySqlText(sql)).toBe("SELECT'-- keep this', '/* keep this */', value")
  })

  it('retains the existing empty-input behavior', () => {
    expect(formatSqlText('   ')).toBe('   ')
    expect(minifySqlText('   ')).toBe('   ')
  })
})
