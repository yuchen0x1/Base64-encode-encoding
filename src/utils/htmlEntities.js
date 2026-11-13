/**
 * 纯 JS、无 DOM 依赖的 HTML 实体编解码工具。
 *
 * 原先 ToolUnicode 通过 `textarea.innerHTML = str` 再读取 `.value` 来解码实体，
 * 属于「把用户输入写进 innerHTML」的反模式（RCDATA 上下文虽不执行脚本，但属于
 * 不安全实践，且 `</textarea>` 会破坏解析上下文）。这里改为纯字符串解析，
 * 不触碰 DOM，既可以安全地在任意环境运行，也便于单元测试。
 */

const NAMED_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' '
}

/**
 * 解码 HTML 实体：支持十进制 (&#65;)、十六进制 (&#x41; / &#X41;) 与常见命名实体。
 * 无法识别的实体原样返回，绝不执行或注入任何内容。
 * @param {string} input
 * @returns {string}
 */
export function decodeHtmlEntities(input) {
  if (typeof input !== 'string' || input.length === 0) return input || ''
  return input.replace(/&(#(?:[xX][0-9a-fA-F]+|[0-9]+)|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10)
      if (Number.isFinite(code) && code >= 0) {
        try {
          return String.fromCodePoint(code)
        } catch {
          return match
        }
      }
      return match
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, match)
      ? NAMED_ENTITIES[match]
      : match
  })
}
