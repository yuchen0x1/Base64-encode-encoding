import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const licenses = ['../LICENSE', '../node_modules/crypto-js/LICENSE'].map(file =>
  readFileSync(new URL(file, import.meta.url), 'utf8').trim()
)

export default defineConfig({
  publicDir: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  ssr: { noExternal: ['crypto-js'] },
  build: {
    ssr: 'cli/main.js',
    target: 'node22',
    outDir: 'dist-cli',
    rolldownOptions: {
      output: {
        entryFileNames: `GeekToolbox-CLI-${version}.mjs`,
        codeSplitting: false,
        banner: `/*\n${licenses.join('\n\n')}\n*/`
      }
    }
  }
})
