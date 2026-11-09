#!/usr/bin/env node
/**
 * 极客工具箱 · 发布脚本（零依赖）
 *
 * 用法：
 *   node scripts/release.mjs                      # 用 package.json 当前版本构建并生成网页更新包
 *   node scripts/release.mjs --bump patch         # 先升版本号再发布
 *   node scripts/release.mjs --version 0.0.2      # 指定版本号
 *   node scripts/release.mjs --desktop            # 额外产出 Windows 安装包并写入桌面更新源
 *   node scripts/release.mjs --skip-build         # 复用已有 dist/（调试发布流程时用）
 *
 * 产物：
 *   updates/web/version.json + geek-toolbox-web-<version>.zip           （网页版更新源）
 *   updates/desktop/version.json + GeekToolbox-Setup-<version>.exe      （桌面版更新源）
 *
 * 桌面端只发布一个 NSIS 安装包：安装包既是安装载体也是更新载体，
 * 不再产出便携版、完整 ZIP 与增量 ZIP。
 */
import fs from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { zipDirectory } from '../shared/zip.js'
import { normalizeVersion, compareVersions } from '../shared/version.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function parseArgs(argv) {
  const args = { desktop: false, skipBuild: false, bump: '', version: '', notes: '', out: '' }
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--desktop') args.desktop = true
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
  --desktop                   同时构建 Windows 安装包（NSIS）并写入 updates/desktop
  --skip-build                跳过 vite build（复用 dist）
  --notes "a|b|c"             覆盖 release-notes.json 中的更新说明（用 | 分隔）
  --out <dir>                 指定 electron-builder 输出目录（默认 release）
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

function loadEntry(version) {
  if (args.notes) return { notes: args.notes.split('|').map((item) => item.trim()).filter(Boolean), date: '' }
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

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
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
  const entry = loadEntry(version)
  return {
    version,
    channel: 'stable',
    buildTime: new Date().toISOString(),
    releaseDate: entry.date,
    notes: entry.notes,
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

/**
 * 构建 Windows 安装包（NSIS）并写入桌面更新源。
 * 只产出一个安装包：它既是首次安装的载体，也是后续自动更新的载体，
 * 用户不再需要区分「安装版 / 便携版 / 更新包」。
 */
async function buildDesktopInstaller(version) {
  const outDir = args.out || 'release'
  console.log(`[release] 构建 Windows 安装包（NSIS）→ ${outDir}/ …`)
  await run('npx', [
    'electron-builder',
    '--win',
    'nsis',
    '--x64',
    '--publish',
    'never',
    ...(args.out ? [`--config.directories.output=${args.out}`] : [])
  ])

  const fileName = `GeekToolbox-Setup-${version}.exe`
  const installerPath = path.join(ROOT, outDir, fileName)
  if (!existsSync(installerPath)) throw new Error(`未找到 ${outDir}/${fileName}，安装包构建失败`)

  const buffer = await fs.readFile(installerPath)
  const manifest = await writePackage(path.join(ROOT, 'updates', 'desktop'), fileName, buffer, version)
  manifest.kind = 'nsis'
  await writeJson(path.join(ROOT, 'updates', 'desktop', 'version.json'), manifest)

  console.log(`[release] Windows 安装包: ${outDir}/${fileName} (${formatSize(buffer.length)})`)
  console.log('[release] 桌面更新源: updates/desktop/（version.json + 同名安装包，仅两个文件）')
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
  const desktop = args.desktop ? await buildDesktopInstaller(nextVersion) : null

  console.log('\n==============================================')
  console.log(` 发布完成 · v${nextVersion}`)
  console.log('==============================================')
  console.log(`更新说明: ${web.notes.length} 条`)
  console.log('发布目录:')
  console.log('  updates/web/     ← 网页版更新源（静态托管该目录或放到服务器）')
  if (desktop) {
    console.log('  updates/desktop/ ← 桌面版更新源（version.json + GeekToolbox-Setup-*.exe）')
  }
  console.log('\n提示: 桌面端发布到 GitHub Release 时只需上传两个文件——Setup 安装包与 version.json。')
}

main().catch((error) => {
  console.error('\n[release] 失败:', error.message)
  process.exit(1)
})
