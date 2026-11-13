import { describe, it, expect } from 'vitest'
import { decodeHtmlEntities } from '../src/utils/htmlEntities.js'

describe('decodeHtmlEntities', () => {
  it('decodes common named entities', () => {
    expect(decodeHtmlEntities('&lt;&gt;&amp;&quot;')).toBe('<>&"')
    expect(decodeHtmlEntities('&apos;')).toBe("'")
  })
  it('decodes decimal and hexadecimal numeric entities', () => {
    expect(decodeHtmlEntities('&#20320;')).toBe('你')
    expect(decodeHtmlEntities('&#x4f60;')).toBe('你')
    expect(decodeHtmlEntities('&#65;')).toBe('A')
    expect(decodeHtmlEntities('&#X41; &#X1F680;')).toBe('A 🚀')
  })
  it('does not partially decode malformed decimal entities', () => {
    expect(decodeHtmlEntities('&#65abc; &#1E2; &#xGG;')).toBe('&#65abc; &#1E2; &#xGG;')
  })
  it('leaves unknown entities untouched', () => {
    expect(decodeHtmlEntities('&foo;')).toBe('&foo;')
  })
  it('handles mixed content', () => {
    expect(decodeHtmlEntities('a&lt;b&gt;c &amp; d')).toBe('a<b>c & d')
  })
  it('is safe against injection payloads (no DOM, no execution)', () => {
    expect(decodeHtmlEntities('<img src=x onerror=alert(1)>')).toBe(
      '<img src=x onerror=alert(1)>'
    )
  })
})
