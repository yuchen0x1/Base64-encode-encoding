import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STABLE_TAG } from '../shared/github-release.js'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const lock = JSON.parse(read('package-lock.json'))
const notes = JSON.parse(read('release-notes.json'))
const tag = process.argv[2] || `v${pkg.version}`
assert.match(tag, STABLE_TAG, 'Expected a stable vMAJOR.MINOR.PATCH tag')
assert.equal(tag, `v${pkg.version}`)
assert.equal(lock.version, pkg.version)
assert.equal(lock.packages[''].version, pkg.version)
const entry = notes[pkg.version]
assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/)
assert.ok(entry.notes.length && entry.notes.every(item => typeof item === 'string' && item.trim()))
assert.ok(read('CHANGELOG.md').split(/\r?\n/).some(line => line.startsWith(`## ${pkg.version} `)))
const history = read('docs/releases/release-notes.md')
const prefix = `## ${tag}`
const sections = history.split(/(?=^## v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[ \t（(]|\r?$))/m)
const section = sections.find(entry =>
  [prefix + ' ', prefix + '（', prefix + '(', prefix + '\n', prefix + '\r\n'].some(header => entry.startsWith(header))
)
assert.ok(section, 'Missing canonical release notes')
const releaseNotes = section.slice(section.indexOf('\n') + 1).trim()
assert.ok(releaseNotes, 'Missing canonical release note body')
if (process.argv[3] === '--notes') console.log(releaseNotes)
else console.log(`PASS: ${tag}, lockfile and release history agree`)
