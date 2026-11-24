import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { productionConnectSource, stripDevelopmentWebSockets } from '../src/utils/rendererCsp.js'

const root = path.resolve('.')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('Electron renderer security policy', () => {
  it('uses a hash-approved bootstrap script without script unsafe-inline/eval', () => {
    const html = read('index.html')
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]
    expect(csp).toBeTruthy()
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("'wasm-unsafe-eval'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'none'")
    expect(csp).not.toContain('connect-src https:')

    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1])
    expect(scripts).toHaveLength(1)
    const digest = crypto.createHash('sha256').update(scripts[0], 'utf8').digest('base64')
    expect(csp).toContain(`'sha256-${digest}'`)
  })

  it('removes Vite loopback sockets from production CSP while preserving self', () => {
    const devHtml = read('index.html')
    const productionHtml = stripDevelopmentWebSockets(devHtml)
    const source = productionHtml.match(/connect-src\s+([^;"]+)/)?.[1]

    expect(productionConnectSource("'self' ws://localhost:5173 ws://127.0.0.1:5173")).toBe("'self'")
    expect(source).toBe("'self'")
    expect(source).not.toMatch(/localhost|127\.0\.0\.1/)
  })

  it('keeps renderer Node access disabled and sandbox/context isolation enabled', () => {
    const main = read('electron/main.js')
    expect(main).toMatch(/nodeIntegration:\s*false/)
    expect(main).toMatch(/contextIsolation:\s*true/)
    expect(main).toMatch(/sandbox:\s*true/)
    expect(main).toMatch(/webSecurity:\s*true/)
    expect(main).toMatch(/webviewTag:\s*false/)
    expect(main).toContain('setWindowOpenHandler')
    expect(main).toContain('will-navigate')
    expect(main).toContain('will-redirect')
    expect(main).toContain('setPermissionRequestHandler')
  })

  it('exposes only the narrow updater bridge from preload', () => {
    const preload = read('electron/preload.cjs')
    expect(preload).toContain("contextBridge.exposeInMainWorld('toolboxUpdater'")
    expect(preload).not.toMatch(/exposeInMainWorld\(['"]ipcRenderer/)
    expect(preload).not.toMatch(/exposeInMainWorld\(['"]electron/)
  })
})
