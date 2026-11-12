import { collectRegexMatches } from './regexMatch.js'

self.onmessage = event => {
  try {
    self.postMessage(collectRegexMatches(event.data))
  } catch (error) {
    self.postMessage({ error: error.message || '正则表达式无效。' })
  }
}
