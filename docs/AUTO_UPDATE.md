# 自动更新实施说明

更新日期：2026-11-13（Asia/Shanghai）

## 1. 当前方案

项目同时支持三种运行形态：

| 运行形态 | 更新来源 | 更新动作 |
|---|---|---|
| Electron Windows 安装版 | GitHub Release 的 `version.json` 与 NSIS 安装包 | 下载、断点续传重试、SHA-256、可选 Authenticode 校验、安装助手覆盖、版本核验、重启 |
| 本地 Web 更新服务 | `updates/web/version.json` 与网页 ZIP | 下载、SHA-256、ZIP 限制与 CRC 校验、目录换位或逐文件回滚、服务器重启 |
| 纯静态 Web | 当前部署目录的 `version.json` | 检查版本、清理缓存、刷新页面；不能由浏览器直接覆盖服务器文件 |

Electron 没有引入 `electron-updater`：当前项目需要先校验 NSIS 安装包，再由独立安装助手执行覆盖和安装后 `app.asar` 版本核验。这样可以继续使用现有的回滚与损坏安装包防护逻辑。

## 2. 版本与清单

版本使用 `MAJOR.MINOR.PATCH`，发布标签格式为 `vX.Y.Z`。发布脚本生成：

- `updates/desktop/version.json`
- `updates/desktop/GeekToolbox-Setup-X.Y.Z.exe`
- `updates/web/version.json`
- `updates/web/geek-toolbox-web-X.Y.Z.zip`

桌面清单示例：

```json
{
  "version": "0.0.4",
  "kind": "nsis",
  "channel": "stable",
  "package": {
    "url": "GeekToolbox-Setup-0.0.4.exe",
    "sha256": "真实的 64 位 SHA-256",
    "size": 123456789,
    "signature": {
      "type": "authenticode",
      "thumbprint": "真实证书指纹"
    }
  }
}
```

`package.signature` 可选。存在时客户端必须验证 Authenticode 状态为 `Valid` 且证书指纹完全匹配；验证失败会拒绝安装。当前没有提交代码签名证书，因此未签名安装包只能完成 SHA-256 校验，不能宣称已完成数字签名验证。

## 3. GitHub Actions 发布

工作流文件：

- `.github/workflows/quality.yml`：`main` push、面向 `main` 的 PR、手动运行；执行 `npm ci`、测试、lint 和前端构建。
- `.github/workflows/build-all.yml`：继续构建 Web、Windows、macOS、iOS、Android 产物；已统一只监听 `main`。
- `.github/workflows/release.yml`：只由 `vX.Y.Z` 标签或手动指定已有标签触发；构建并验证 Windows NSIS、生成 Web/桌面清单，创建或幂等更新同标签 GitHub Release。

发布工作流使用 `GITHUB_TOKEN`，权限仅为 `contents: write`。不会在普通 push 或 PR 中创建 Release。

### 需要配置的 Secrets

以下 Secrets 都是可选的，但配置后才能生成带签名的 Windows 安装包：

- `WINDOWS_CSC_LINK`：electron-builder 支持的代码签名证书内容或受保护地址。
- `WINDOWS_CSC_KEY_PASSWORD`：证书密码。
- `WINDOWS_AUTHENTICODE_THUMBPRINT`：签名证书 SHA-1 指纹，40 位十六进制。
- `WINDOWS_AUTHENTICODE_SUBJECT`：可选的证书主题描述。

私钥、证书密码和 Token 不得写入仓库。未配置证书时，发布仍会生成安装包和 SHA-256 清单，但清单不会加入 `signature` 字段。

## 4. 发布步骤

在 `main` 上完成版本与更新日志修改后：

```bash
npm test
npm run lint
npm run build
git add package.json package-lock.json release-notes.json
git commit -m "release: v0.0.4"
git push origin main
git tag v0.0.4
git push origin v0.0.4
```

标签工作流会检查标签版本与 `package.json` 完全一致。不要在没有对应版本提交的情况下重复创建同名标签。

本地生成更新包：

```bash
npm run release                 # Web 更新包
npm run release:desktop         # Windows 安装包 + 桌面清单
```

Windows 安装包构建位于云同步目录时，优先使用 `--out` 指向本地磁盘，并让发布脚本执行 NSIS 外层归档与应用载荷校验（兼容 `app-64.7z` / `resources/app.asar` 两种结构）。

## 5. 客户端流程

1. 启动后延迟检查；用户也可以点击版本号手动检查。
2. 版本比较使用共享的语义化版本解析，旧版本不会触发降级更新。
3. Electron 下载先写入 `userData/updates/`，HTTP 下载支持最多三次重试，并在服务器支持 Range 时从已有临时文件继续。
4. 下载完成后校验清单中的文件大小和 SHA-256。
5. 如果清单提供 Authenticode 指纹，再使用 Windows `Get-AuthenticodeSignature` 校验签名和指纹。
6. 验证通过后才启动独立安装助手；助手从安装目录外的临时运行时副本启动，等待旧进程退出，执行静默安装，检查可执行文件与 `app.asar/package.json` 版本，失败时自动重试并回退到交互式安装。

## 6. Web 更新流程

本地更新服务默认只监听 `127.0.0.1`，只有回环请求可以触发替换。远程触发必须显式使用 `--allow-remote-update` 或 `TOOLBOX_ALLOW_REMOTE_UPDATE=1`。

```bash
node server/serve.js --root dist --feed updates/web
```

服务器会在替换前校验 SHA-256、ZIP 条目数量/解压大小、路径安全和 CRC；目录换位失败时降级为逐文件替换，并保留回滚副本。

## 7. 失败处理

- 更新源不可访问：启动检查静默失败，不影响当前版本运行。
- 下载中断：Electron HTTP 下载保留临时文件并重试；最终失败会清理未完成文件。
- SHA-256 不匹配：拒绝安装，旧版本保持不变。
- Authenticode 状态或指纹不匹配：拒绝安装。
- NSIS 安装失败：安装助手验证失败并尝试重新执行安装或交互式回退；v0.0.4 对旧卸载器 code 2 做有限放行，并在新卸载器中采用直接目录清理，旧版本文件不会被客户端主动删除。
- Web 文件替换失败：服务端恢复目录或逐文件回滚，并记录更新日志。

## 8. 测试命令

```bash
npm test
npm run lint
npm run build
```

更新链路测试位于 `tests/updater.test.js`、`tests/update-validation.test.js`、`tests/apply-installer.test.js`、`tests/installer-verification.test.js`、`tests/serve.test.js` 和 `tests/zip-limits.test.js`。

当前环境能够验证本地清单、哈希、路径防护、回滚逻辑和构建；真实 GitHub Release 发布、Windows 签名、安装后重启和 macOS/iOS 商店发布需要对应外部凭据或平台环境。
