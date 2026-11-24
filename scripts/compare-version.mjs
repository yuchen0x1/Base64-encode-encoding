#!/usr/bin/env node
import { compareVersions } from '../shared/version.js'

const [left, right] = process.argv.slice(2)
if (!left || !right) {
  console.error('Usage: node scripts/compare-version.mjs <left> <right>')
  process.exit(2)
}

try {
  console.log(compareVersions(left, right))
} catch (error) {
  console.error(error.message)
  process.exit(2)
}
