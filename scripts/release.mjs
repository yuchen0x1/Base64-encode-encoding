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
import { createRequire } from 'node:module'
import { zipDirectory } from '../shared/zip.js'
import { normalizeVersion, compareVersions } from '../shared/version.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const { extractFile } = require('@electron/asar')

function parseArgs(argv) {
  const args = { desktop: false, skipBuild: false, bump: '', version: '', notes: '', out: '', installer: '', skipVerify: false }
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i]
    if (key === '--desktop') args.desktop = true
    else if (key === '--skip-build') args.skipBuild = true
    else if (key === '--skip-verify') args.skipVerify = true
    else if (key === '--bump') { args.bump = argv[i + 1]; i += 1 }
    else if (key === '--version') { args.version = argv[i + 1]; i += 1 }
    else if (key === '--notes') { args.notes = argv[i + 1]; i += 1 }
    else if (key === '--out') { args.out = argv[i + 1]; i += 1 }
    else if (key === '--installer') { args.installer = argv[i + 1]; i += 1 }
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
  --skip-verify               跳过安装包完整性校验（不建议；需要 7-Zip）
  --installer <path>          复用已构建好的安装包，跳过 electron-builder
  --notes "a|b|c"             覆盖 release-notes.json 中的更新说明（用 | 分隔）
  --out <dir>                 指定 electron-builder 输出目录（默认 release，可传绝对路径）
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

/**
 * 不经过 shell 的进程调用。
 * shell=true 时 Node 只是把 command + args 用空格拼接，路径里带空格（本项目路径就带）
 * 会被拆成多个参数，因此 7z 这类需要传绝对路径的调用必须走这条。
 */
function runDirect(command, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { cwd: ROOT, stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(command)} ${commandArgs.join(' ')} 退出码 ${code}`))
    })
  })
}

const SEVEN_ZIP_CANDIDATES = [
  process.env.TOOLBOX_7Z,
  '7z',
  '7za',
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  '/usr/bin/7z',
  '/usr/local/bin/7z'
].filter(Boolean)

async function resolveSevenZip() {
  for (const candidate of SEVEN_ZIP_CANDIDATES) {
    try {
      await runDirect(candidate, ['i'])
      return candidate
    } catch {
      /* 换下一个候选 */
    }
  }
  return null
}

/**
 * 安装包完整性校验。
 *
 * 事故背景：v0.0.2 首次构建出的 NSIS 安装包能正常「安装」并返回退出码 0，
 * 但内层 app-64.7z 的数据区已损坏，解压到一半就静默放弃，
 * 结果是安装目录里只有 dll/pak、没有主程序与 app.asar，快捷方式随即失效。
 * 因此发布前必须验证安装器外层归档及其应用载荷，而不是只看
 * electron-builder 是否退出成功。不同 electron-builder 版本可能把载荷
 * 作为 app-64.7z 或 resources/app.asar 写入安装器，两种结构都兼容。
 */
async function verifyInstallerIntegrity(installerPath, version) {
  if (args.skipVerify) {
    console.warn('[release] 已按 --skip-verify 跳过安装包完整性校验（风险自负）')
    return
  }

  const sevenZip = await resolveSevenZip()
  if (!sevenZip) {
    throw new Error(
      '未找到 7z，无法校验安装包完整性。请安装 7-Zip 或设置 TOOLBOX_7Z 指向 7z.exe；' +
      '确认要跳过请加 --skip-verify'
    )
  }

  const workDir = path.join(ROOT, '.tmp-release', `verify-${version}-${Date.now()}`)
  await fs.mkdir(workDir, { recursive: true })

  console.log('[release] 校验 NSIS 安装包及应用载荷…')
  try {
    await runDirect(sevenZip, ['t', installerPath])
  } catch {
    throw new Error(
      '安装包外层归档校验失败，已中止发布。\n' +
      '  常见原因：构建输出目录位于云同步目录（OneDrive / 坚果云 / 移动云盘等），同步客户端在大文件落盘时介入写坏归档。\n' +
      '  处理：用 --out 指向本地磁盘重建，例如 --out E:/geek-build；此类安装包可能让用户安装到一半就失去主程序'
    )
  }

  // electron-builder 旧版把压缩载荷命名为 app-64.7z；新版通常直接嵌入
  // resources/app.asar。先尝试旧结构，再回退到直接提取 app.asar。
  await runDirect(sevenZip, ['e', installerPath, `-o${workDir}`, '-y', '-ir!*app-64.7z'])
  const archivePath = path.join(workDir, 'app-64.7z')
  if (existsSync(archivePath)) {
    try {
      await runDirect(sevenZip, ['t', archivePath])
    } catch {
      throw new Error('安装包内层归档校验失败（app-64.7z 数据损坏），已中止发布')
    }
    console.log('[release] 安装包完整性校验通过（app-64.7z CRC 正常）')
    return
  }

  const asarPath = path.join(workDir, 'app.asar')
  await runDirect(sevenZip, ['e', installerPath, `-o${workDir}`, '-y', 'resources/app.asar'])
  if (!existsSync(asarPath)) throw new Error('安装包内未找到 app-64.7z 或 resources/app.asar，发布包结构异常')

  try {
    const metadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'))
    if (normalizeVersion(metadata.version) !== version) {
      throw new Error(`app.asar 版本为 ${metadata.version}，期望 ${version}`)
    }
  } catch (error) {
    throw new Error(`安装包 app.asar 校验失败：${error.message}`, { cause: error })
  }
  console.log('[release] 安装包完整性校验通过（外层 7z + app.asar 结构正常）')
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function loadAuthenticodeSignature() {
  const raw = String(process.env.TOOLBOX_AUTHENTICODE_THUMBPRINT || '').replace(/\s+/g, '').toUpperCase()
  if (!raw) return null
  if (!/^[A-F0-9]{40}$/.test(raw)) {
    throw new Error('TOOLBOX_AUTHENTICODE_THUMBPRINT 必须是 40 位十六进制 Authenticode 指纹')
  }
  return {
    type: 'authenticode',
    thumbprint: raw,
    subject: String(process.env.TOOLBOX_AUTHENTICODE_SUBJECT || '')
  }
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
  const manifest = {
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
  if (/\.exe$/i.test(fileName)) {
    const signature = loadAuthenticodeSignature()
    if (signature) manifest.package.signature = signature
  }
  return manifest
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
  const outDir = args.out ? path.resolve(ROOT, args.out) : path.join(ROOT, 'release')
  const fileName = `GeekToolbox-Setup-${version}.exe`
  let installerPath

  if (args.installer) {
    // 复用已构建好的安装包（例如先构建到同步盘之外的目录，再回来写更新源）
    installerPath = path.resolve(ROOT, args.installer)
    if (!existsSync(installerPath)) throw new Error(`指定的安装包不存在：${installerPath}`)
    console.log(`[release] 复用已构建的安装包：${installerPath}`)
  } else {
    console.log(`[release] 构建 Windows 安装包（NSIS）→ ${outDir}/ …`)
    await run('npx', [
      'electron-builder',
      '--win',
      'nsis',
      '--x64',
      '--publish',
      'never',
      ...(args.out ? [`--config.directories.output=${args.out}`] : [])
    ], {
      // 兼容 WorkBuddy / Agent 运行环境：其 Node 安全删除垫片会把 electron-builder 的
      // fs.rm(win-unpacked) 改写成异步「回收站移动」，与随后的解压/压缩竞态。
      // 该变量只影响本子进程，不改变系统行为。
      env: { ...process.env, CODEBUDDY_SAFE_DELETE_ENABLED: '0' }
    })

    installerPath = path.join(outDir, fileName)
    if (!existsSync(installerPath)) throw new Error(`未找到 ${outDir}/${fileName}，安装包构建失败`)
  }

  // 先校验包内归档，再写更新源清单：损坏的安装包绝不能进入 version.json
  await verifyInstallerIntegrity(installerPath, version)

  const buffer = await fs.readFile(installerPath)
  const manifest = await writePackage(path.join(ROOT, 'updates', 'desktop'), fileName, buffer, version)
  manifest.kind = 'nsis'
  await writeJson(path.join(ROOT, 'updates', 'desktop', 'version.json'), manifest)

  console.log(`[release] Windows 安装包: ${installerPath} (${formatSize(buffer.length)})`)
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
  if (desktop) console.log('安装包完整性: 已通过 NSIS 外层归档与应用载荷校验')
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
