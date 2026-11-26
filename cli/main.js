import { createReadStream } from 'node:fs'
import { isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { BATCH_LIMITS, BATCH_OPERATIONS, createBatchRecipe, executeBatchRecipe, parseBatchRecipe } from '../src/utils/batchProcessing.js'
import { fetchLatestRelease, getCliUpdate } from '../shared/github-release.js'

const version = __APP_VERSION__
const operations = BATCH_OPERATIONS.flatMap(group => group.items.map(item => item.value))
const help = `Geek Toolbox CLI ${version}

Usage:
  node GeekToolbox-CLI.mjs run --step <operation> [--step <operation>] [--input <file>]
  node GeekToolbox-CLI.mjs run --recipe <desktop-recipe.json> [--input <file>]
  node GeekToolbox-CLI.mjs --version
  node GeekToolbox-CLI.mjs --check-update

Reads stdin when --input is omitted or set to -. Processes a single input as
one item (up to 64 MiB). Writes the exact result to stdout without a newline.
With --step you may also use --url-safe or --upper-hash.
Operations: ${operations.join(', ')}
`

function openInput(file) {
  // Reject UNC and device paths. A local transform should not open a network
  // share by accident or connect to a named pipe supplied as a filename.
  if (/^(?:[\\/]{2}|\\\\[.?]\\)/.test(file)) throw new Error('Use a local input file')
  if (process.platform === 'win32' && /^[a-z]:/i.test(file) && !isAbsolute(file)) {
    throw new Error('Use an absolute path after a Windows drive letter')
  }
  return createReadStream(file)
}

async function readBytes(stream, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > limit) throw new Error(`Input exceeds ${limit} bytes`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      step: { type: 'string', multiple: true },
      recipe: { type: 'string' },
      input: { type: 'string' },
      'url-safe': { type: 'boolean' },
      'upper-hash': { type: 'boolean' }
    }
  })
  if (values.recipe !== undefined && (values.step || values['url-safe'] || values['upper-hash'])) {
    throw new Error('Choose either --recipe or --step and its options')
  }
  const recipe = values.recipe === undefined
    ? createBatchRecipe(values.step, { urlSafeBase64: values['url-safe'], upperHash: values['upper-hash'] })
    : parseBatchRecipe(new TextDecoder('utf-8', { fatal: true }).decode(
      await readBytes(openInput(values.recipe), BATCH_LIMITS.recipeBytes)
    ))
  if ((!values.input || values.input === '-') && process.stdin.isTTY) {
    throw new Error('Pipe input into stdin or use --input <file>')
  }
  const source = values.input && values.input !== '-' ? openInput(values.input) : process.stdin
  const input = await readBytes(source, BATCH_LIMITS.fileBytes)
  process.stdout.write(executeBatchRecipe(input, recipe))
}

async function main(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
    process.stdout.write(help)
  } else if (args.length === 1 && args[0] === '--version') {
    console.log(version)
  } else if (args.length === 1 && args[0] === '--check-update') {
    console.log(JSON.stringify(getCliUpdate(await fetchLatestRelease(), version), null, 2))
  } else if (args[0] === 'run') {
    await run(args.slice(1))
  } else {
    throw new Error('Unknown command. See --help.')
  }
}

function reportCliError(error) {
  // Parser errors and file paths may contain terminal control sequences.
  const message = JSON.stringify(String(error?.message ?? error)).slice(1, -1)
    .replace(/[\u007f-\u009f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
  console.error('Geek Toolbox: %s', message)
  process.exitCode = 1
}

process.stdout.on('error', error => {
  if (error.code === 'EPIPE') return
  reportCliError(error)
})
main(process.argv.slice(2)).catch(reportCliError)
