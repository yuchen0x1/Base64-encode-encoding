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

    expect(minifySqlText(sql)).toBe("SELECT '-- keep this', '/* keep this */', value")
  })

  it('preserves commas and whitespace inside quoted strings and identifiers', () => {
    const sql = `SELECT 'a,b', 'x,  y', "column,a", \`column,b\` FROM source`
    expect(minifySqlText(sql)).toBe(sql)
  })

  it('retains statement separation after line comments while formatting', () => {
    for (const newline of ['\n', '\r\n', '\r']) {
      const sql = `SELECT a -- keep WHERE x, y${newline}FROM source WHERE a = 1`
      const formatted = formatSqlText(sql)
      expect(formatted).toMatch(/-- keep WHERE x, y\n\s*FROM source/)
      expect(formatted).toContain('\nWHERE a = 1')
      expect(minifySqlText(sql)).toBe('SELECT a FROM source WHERE a = 1')
    }
  })

  it('does not format SQL keywords or punctuation inside block comments', () => {
    const comment = '/* keep WHERE x,   y AND z */'
    expect(formatSqlText(`SELECT a ${comment} FROM source`)).toContain(comment)
  })

  it('retains the existing empty-input behavior', () => {
    expect(formatSqlText('   ')).toBe('   ')
    expect(minifySqlText('   ')).toBe('   ')
  })
})
