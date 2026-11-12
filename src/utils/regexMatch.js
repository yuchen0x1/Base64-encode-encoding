export function collectRegexMatches({ pattern, text, flags, global }) {
  if (!pattern || !text) return { matches: [], isTruncated: false }

  const regexFlags = global && !flags.includes('g') ? `${flags}g` : flags
  const regex = new RegExp(pattern, regexFlags)
  const matches = []
  let isTruncated = false

  if (global) {
    const maxCount = 500
    let match

    while ((match = regex.exec(text)) !== null) {
      matches.push(match[0])
      if (matches.length >= maxCount) {
        isTruncated = true
        break
      }
      // Advance after empty matches so global patterns cannot loop forever.
      if (match[0].length === 0) regex.lastIndex++
    }
  } else {
    const match = regex.exec(text)
    if (match) matches.push(match[0])
  }

  return { matches, isTruncated }
}

export { createRegexMatchRunner } from './regexMatchRunner.js'
