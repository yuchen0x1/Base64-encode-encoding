import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const pkgPath = fileURLToPath(new URL('./package.json', import.meta.url))
const notesPath = fileURLToPath(new URL('./release-notes.json', import.meta.url))
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const buildTime = new Date().toISOString()

function loadNotes(version) {
  if (!existsSync(notesPath)) return []
  try {
    const all = JSON.parse(readFileSync(notesPath, 'utf8'))
    const entry = all[version]
    if (Array.isArray(entry)) return entry
    if (entry && Array.isArray(entry.notes)) return entry.notes
    return []
  } catch {
    return []
  }
}

/**
 * 构建期注入版本元数据，并产出 dist/version.json。
 * 该文件是「当前部署版本」的唯一事实来源：
 *  - 网页端静态模式与更新服务端都读取它来判断线上版本
 *  - 开发服务器同样返回它，保证 /version.json 在任何模式下可用
 */
function versionManifestPlugin() {
  const payload = () => ({
    version: pkg.version,
    buildTime,
    channel: 'stable',
    notes: loadNotes(pkg.version)
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

export default defineConfig({
  base: './', // 确保在 Electron 和本地文件协议 (file://) 中资源路径正确
  plugins: [vue(), versionManifestPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(buildTime)
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
