import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRequire } from 'node:module'
import { stripDevelopmentWebSockets } from './src/utils/rendererCsp.js'

const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url))
const notesPath = fileURLToPath(new URL('./release-notes.json', import.meta.url))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const buildTime = new Date().toISOString()
const nodeRequire = createRequire(pkgPath)
const readerEntry = nodeRequire.resolve('zxing-wasm/reader', { paths: [path.dirname(pkgPath)] })
const zxingWasmPath = readerEntry.replace(/[\\/]dist[\\/]cjs[\\/]reader[\\/]index\.js$/i, '/dist/reader/zxing_reader.wasm')

function loadEntry(version) {
  if (!existsSync(notesPath)) return { notes: [], date: '' }
  try {
    const all = JSON.parse(readFileSync(notesPath, 'utf8'))
    const entry = all[version]
    if (Array.isArray(entry)) return { notes: entry, date: '' }
    if (entry && Array.isArray(entry.notes)) return { notes: entry.notes, date: entry.date || '' }
    return { notes: [], date: '' }
  } catch {
    return { notes: [], date: '' }
  }
}

/**
 * Inline the reader WASM as a virtual base64 module. Electron loads the renderer
 * over file://; the WASM must never be fetched from a CDN or a separate asset URL.
 */
function zxingWasmPlugin() {
  return {
    name: 'toolbox-inline-zxing-wasm',
    resolveId(id) {
      if (id === 'virtual:zxing-wasm-reader-base64') return '\0virtual:zxing-wasm-reader-base64'
      return null
    },
    load(id) {
      if (id === '\0virtual:zxing-wasm-reader-base64') {
        return `export default ${JSON.stringify(readFileSync(zxingWasmPath).toString('base64'))}`
      }
      return null
    }
  }
}

const currentEntry = loadEntry(pkg.version)

// Reused by Vitest so component tests can resolve the same virtual module
// that production uses to inline the ZXing reader WASM.
export { zxingWasmPlugin as zxingWasmTestPlugin }

/**
 * 构建期注入版本元数据，并产出 dist/version.json。
 * 该文件记录 Windows 渲染界面的构建版本，供打包脚本核对。
 * 开发服务器同样返回它，方便本地调试。
 */
function versionManifestPlugin() {
  const payload = () => ({
    version: pkg.version,
    buildTime,
    channel: 'stable',
    releaseDate: currentEntry.date,
    notes: currentEntry.notes
  })

  return {
    name: 'toolbox-version-manifest',
    configureServer(server) {
      server.middlewares.use('/version.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        res.end(JSON.stringify(payload(), null, 2))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(payload(), null, 2)
      })
    }
  }
}

function rendererCspPlugin(isBuild) {
  return {
    name: 'toolbox-renderer-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return isBuild ? stripDevelopmentWebSockets(html) : html
      }
    }
  }
}

export default defineConfig(({ command }) => ({
  base: './', // 确保在 Electron 和本地文件协议 (file://) 中资源路径正确
  plugins: [vue(), versionManifestPlugin(), zxingWasmPlugin(), rendererCspPlugin(command === 'build')],
  worker: {
    format: 'es',
    plugins: () => [zxingWasmPlugin()]
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime),
    // 更新日志随包注入：Electron 以 file:// 加载页面，无法 fetch version.json
    __RELEASE_NOTES__: JSON.stringify(currentEntry.notes),
    __RELEASE_DATE__: JSON.stringify(currentEntry.date)
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    watch: {
      // Hidden Electron smoke profiles contain locked Chromium cache databases.
      ignored: ['**/.tmp-verify/**']
    }
  }
}))
