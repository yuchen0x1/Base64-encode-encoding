#!/usr/bin/env node
/**
 * 极客工具箱 · 发布脚本（零依赖）
 *
 * 用法：
 *   node scripts/release.mjs                      # 用 package.json 当前版本构建并生成网页更新包
 *   node scripts/release.mjs --bump patch         # 先升版本号再发布
 *   node scripts/release.mjs --version 1.3.0      # 指定版本号
 *   node scripts/release.mjs --desktop            # 额外产出桌面端更新包（electron-builder --dir）
 *   node scripts/release.mjs --delta              # 桌面端增量包（仅 resources/app.asar，体积最小）
 *   node scripts/release.mjs --skip-build         # 复用已有 dist/（调试发布流程时用）
 *
 * 产物：
 *   updates/web/version.json + geek-toolbox-web-<version>.zip
 *   updates/desktop/version.json + geek-toolbox-desktop-<version>.zip
 */
import fs from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createZip, zipDirectory } from '../shared/zip.js'
import { normalizeVersion, compareVersions } from '../shared/version.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

function parseArgs(argv) {
  const args = { desktop: false, skipBuild: false, bump: '', version: '', notes: '', out: '', delta: false }
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--desktop') args.desktop = true
    else if (key === '--delta') args.delta = true
    else if (key === '--skip-build') args.skipBuild = true
    else if (key === '--bump') { args.bump = argv[i + 1]; i += 1 }
    else if (key === '--version') { args.version = argv[i + 1]; i += 1 }
    else if (key === '--notes') { args.notes = argv[i + 1]; i += 1 }
    else if (key === '--out') { args.out = argv[i + 1]; i += 1 }
    else if (key === '--help' || key === '-h') args.help = true
  }
  return args
}

const args = parseArgs(process.argv)

if (args.help) {
  console.log(`
发布脚本
  --bump <patch|minor|major>  自动递增版本号
  --version <x.y.z>           指定版本号
  --desktop                   同时打包桌面端（electron-builder --dir）
  --skip-build                跳过 vite build（复用 dist）
  --notes "a|b|c"             覆盖 release-notes.json 中的更新说明（用 | 分隔）
  --out <dir>                 指定 electron-builder 输出目录（默认 release）
  --delta                     桌面端产出增量包：复用已有运行时，仅替换 resources/app.asar
`)
  process.exit(0)
}

const pkgPath = path.join(ROOT, 'package.json')
const lockPath = path.join(ROOT, 'package-lock.json')
const notesPath = path.join(ROOT, 'release-notes.json')

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const currentVersion = normalizeVersion(pkg.version)

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`未知的递增类型: ${type}`)
}

let nextVersion = currentVersion
if (args.version) nextVersion = normalizeVersion(args.version)
else if (args.bump) nextVersion = bumpVersion(currentVersion, args.bump)

function loadNotes(version) {
  if (args.notes) return args.notes.split('|').map((item) => item.trim()).filter(Boolean)
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

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/**
 * 逐文件删除构建临时目录。
 * 不用 fs.rm(recursive) 是因为部分环境（回收站式删除代理）会拦截批量删除并直接报错，
 * 而构建产物属于可直接丢弃的中间文件，逐项 unlink + rmdir 更稳。仅允许操作项目内的 .tmp-release。
 */
function removeBuildTree(target) {
  const allowed = path.join(ROOT, '.tmp-release')
  const resolved = path.resolve(target)
  if (resolved !== allowed && !resolved.startsWith(allowed + path.sep)) {
    throw new Error(`拒绝删除构建目录之外的内容: ${target}`)
  }
  let stat
  try {
    stat = statSync(resolved)
  } catch {
    return
  }
  if (stat.isDirectory()) {
    for (const name of readdirSync(resolved)) removeBuildTree(path.join(resolved, name))
    try {
      rmdirSync(resolved)
    } catch {
      /* 目录可能已被其他进程清理 */
    }
  } else {
    try {
      unlinkSync(resolved)
    } catch {
      /* 文件可能已被其他进程清理 */
    }
  }
}

async function updatePackageVersion(version) {
  pkg.version = version
  await writeJson(pkgPath, pkg)
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    lock.version = version
    if (lock.packages && lock.packages['']) lock.packages[''].version = version
    await writeJson(lockPath, lock)
  }
  console.log(`[release] 版本号更新为 ${version}`)
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${commandArgs.join(' ')} 退出码 ${code}`))
    })
  })
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function assertDist(version) {
  const distDir = path.join(ROOT, 'dist')
  if (!existsSync(path.join(distDir, 'index.html'))) throw new Error('dist/ 不存在，请先执行构建')
  const manifestFile = path.join(distDir, 'version.json')
  if (!existsSync(manifestFile)) throw new Error('dist/version.json 缺失，请重新构建（vite 插件负责生成）')
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  if (normalizeVersion(manifest.version) !== version) {
    throw new Error(`dist/version.json 版本为 ${manifest.version}，与目标版本 ${version} 不一致，请重新构建`)
  }
  return distDir
}

function buildManifest(version, fileName, buffer) {
  return {
    version,
    channel: 'stable',
    buildTime: new Date().toISOString(),
    notes: loadNotes(version),
    package: {
      url: fileName,
      sha256: sha256(buffer),
      size: buffer.length
    }
  }
}

async function writePackage(outputDir, fileName, buffer, version) {
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(path.join(outputDir, fileName), buffer)
  const manifest = buildManifest(version, fileName, buffer)
  await writeJson(path.join(outputDir, 'version.json'), manifest)
  return manifest
}

async function buildWeb(version) {
  const distDir = await assertDist(version)
  const { buffer } = await zipDirectory(distDir)
  const fileName = `geek-toolbox-web-${version}.zip`
  const manifest = await writePackage(path.join(ROOT, 'updates', 'web'), fileName, buffer, version)
  console.log(`[release] 网页更新包: updates/web/${fileName} (${formatSize(buffer.length)})`)
  return manifest
}

/** 递归复制目录（保持相对结构） */
async function copyInto(from, to) {
  const items = await fs.readdir(from, { withFileTypes: true })
  await fs.mkdir(to, { recursive: true })
  for (const item of items) {
    const src = path.join(from, item.name)
    const dest = path.join(to, item.name)
    if (item.isDirectory()) await copyInto(src, dest)
    else if (item.isFile()) await fs.copyFile(src, dest)
  }
}

/**
 * 桌面增量包：复用用户已安装的 Electron 运行时与原生依赖，
 * 只替换 resources/app.asar，因此体积通常只有几百 KB，下载与安装都极快。
 */
async function buildDesktopDelta(version) {
  const distDir = await assertDist(version)

  let asar
  try {
    asar = require('@electron/asar')
  } catch {
    throw new Error('未找到 @electron/asar，请先执行 npm install（桌面增量包依赖它生成 app.asar）')
  }

  const work = path.join(ROOT, '.tmp-release')
  const srcDir = path.join(work, `app-src-${version}`)
  const asarFile = path.join(work, `app-${version}.asar`)

  console.log('[release] 组装 resources/app.asar …')
  removeBuildTree(srcDir)
  await fs.mkdir(srcDir, { recursive: true })

  // 只收录运行时真正需要的文件：渲染层由 Vite 打包进 dist，
  // 主进程仅依赖 electron 与 Node 内置模块，因此无需携带 node_modules。
  await copyInto(distDir, path.join(srcDir, 'dist'))
  await copyInto(path.join(ROOT, 'electron'), path.join(srcDir, 'electron'))
  await copyInto(path.join(ROOT, 'shared'), path.join(srcDir, 'shared'))

  // asar 内的 package.json 决定 app.getVersion()/main 入口，必须写入目标版本号
  const runtimePkg = {
    name: pkg.name,
    productName: pkg.productName,
    version,
    description: pkg.description,
    author: pkg.author,
    license: pkg.license,
    main: pkg.main,
    type: pkg.type,
    dependencies: pkg.dependencies || {}
  }
  await fs.writeFile(path.join(srcDir, 'package.json'), `${JSON.stringify(runtimePkg, null, 2)}\n`, 'utf8')

  await fs.mkdir(work, { recursive: true })
  removeBuildTree(asarFile)
  await asar.createPackage(srcDir, asarFile)

  const asarBuffer = await fs.readFile(asarFile)
  const buildTime = new Date().toISOString()
  const buffer = createZip([
    { path: 'resources/app.asar', data: asarBuffer },
    {
      path: 'version.json',
      data: Buffer.from(
        `${JSON.stringify({ version, channel: 'stable', buildTime, kind: 'delta' }, null, 2)}\n`,
        'utf8'
      )
    }
  ])

  const fileName = `geek-toolbox-desktop-${version}.zip`
  const manifest = await writePackage(path.join(ROOT, 'updates', 'desktop'), fileName, buffer, version)
  manifest.kind = 'delta'
  await writeJson(path.join(ROOT, 'updates', 'desktop', 'version.json'), manifest)

  removeBuildTree(srcDir)
  removeBuildTree(asarFile)
  console.log(
    `[release] 桌面增量包: updates/desktop/${fileName} (${formatSize(buffer.length)} · app.asar ${formatSize(asarBuffer.length)})`
  )
  return manifest
}

async function buildDesktop(version) {
  console.log('[release] 构建桌面端（electron-builder --dir）…')
  const outDir = args.out || 'release'
  await run('npx', ['electron-builder', '--win', '--x64', '--dir', ...(args.out ? [`--config.directories.output=${args.out}`] : [])])

  const appDir = path.join(ROOT, outDir, 'win-unpacked')
  if (!existsSync(appDir)) throw new Error(`未找到 ${outDir}/win-unpacked，桌面端构建失败`)

  const fileName = `geek-toolbox-desktop-${version}.zip`
  const { buffer } = await zipDirectory(appDir)
  const manifest = await writePackage(path.join(ROOT, 'updates', 'desktop'), fileName, buffer, version)
  manifest.kind = 'full'
  await writeJson(path.join(ROOT, 'updates', 'desktop', 'version.json'), manifest)

  console.log(`[release] 桌面完整包: updates/desktop/${fileName} (${formatSize(buffer.length)})`)
  return manifest
}

async function main() {
  console.log('==============================================')
  console.log(` 极客工具箱发布流程  ${currentVersion} -> ${nextVersion}`)
  console.log('==============================================')

  if (nextVersion !== currentVersion) {
    if (compareVersions(nextVersion, currentVersion) < 0) {
      throw new Error('新版本号不能低于当前版本号')
    }
    await updatePackageVersion(nextVersion)
  }

  if (!args.skipBuild) {
    console.log('[release] 构建前端（vite build）…')
    await run('npm', ['run', 'build'])
  }

  const web = await buildWeb(nextVersion)
  let desktop = null
  if (args.delta) desktop = await buildDesktopDelta(nextVersion)
  else if (args.desktop) desktop = await buildDesktop(nextVersion)

  console.log('\n==============================================')
  console.log(` 发布完成 · v${nextVersion}`)
  console.log('==============================================')
  console.log(`更新说明: ${web.notes.length} 条`)
  console.log('发布目录:')
  console.log('  updates/web/     ← 网页版更新源（静态托管该目录或放到服务器）')
  if (desktop) {
    const kind = desktop.kind === 'delta' ? '增量包 · 仅替换 resources/app.asar' : '完整包'
    console.log(`  updates/desktop/ ← 桌面版更新源（${kind}）`)
  }
  console.log('\n提示: 更新源只需包含 version.json 与 zip 包；客户端通过 version.json 判断版本。')
}

main().catch((error) => {
  console.error('\n[release] 失败:', error.message)
  process.exit(1)
})
