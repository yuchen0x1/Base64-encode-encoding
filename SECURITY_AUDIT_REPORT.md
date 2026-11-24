# 安全审计报告

审计日期：2026-11-24（Asia/Shanghai）  
版本候选：`v0.1.1`（未发布候选，继承 v0.1.0 安全基线）
范围：Electron 主进程 / preload / 更新器、渲染界面 CSP、命令与工具依赖、发布健康工作流。  
边界：本报告记录代码与自动化证据；不等同于第三方渗透测试、代码签名或真实安装升级验收。

## 结论

本次改善了最小权限边界：更新 IPC 调用必须通过主窗口主 frame 与受信文档校验，preload 不再暴露 `ipcRenderer`，外链仅允许官方 HTTPS 白名单，导航、webview、设备权限和 CSP 均已收紧。`npm audit --audit-level=low` 返回 0 vulnerabilities，新增 IPC 与安全策略专项测试已纳入测试套件。

## 已实施控制

- `electron/ipc-security.js` 对 `update:info/check/download/cancel/install` 统一校验窗口、webContents、发送 frame、文档 URL，并拒绝 iframe、分离 frame、销毁窗口和非法导航页。
- `registerTrustedIpcHandlers()` 只允许已登记通道，处理器不接收原始 Electron IPC event。
- `electron/preload.cjs` 仅暴露冻结的 `toolboxUpdater` 接口；`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、`webviewTag: false`。
- `electron/main.js` 一律拒绝应用内新窗口与越界导航；仅官方 HTTPS 域名转交系统浏览器，并拒绝摄像头、麦克风、定位等设备权限。
- 主窗口将普通导航和服务器重定向统一校验到受信应用文档；不受信重定向会被阻止，并有回归断言。
- CSP 去掉脚本 `unsafe-inline` / `unsafe-eval`，首帧主题脚本使用 SHA-256 白名单；二维码 WASM 仅保留 `'wasm-unsafe-eval'` 并在构建期内联，不走 CDN、fetch 或外部资源。
- 更新器在窗口关闭、渲染进程消失和应用退出时取消下载，合并加载期事件并移除待处理监听器，减少半包与重复监听风险。
- Windows 安装生命周期测试选择严格早于候选版本的已发布稳定版，避免发布并发导致 `/releases/latest` 变为候选版本后的假失败。
- maintenance 工作流拆分依赖审计、发布资产校验、文档链接和上游扫描，增加 API 重试及 SHA256 / manifest / CLI / Release attestation 检查。

## 风险与未闭环项

| 风险 | 状态 | 说明 |
|---|---|---|
| WASM 编译豁免 | 已接受 | `'wasm-unsafe-eval'` 仅用于本地内联 ZXing reader；输入为本地图片，但仍是 CSP 的受控例外。 |
| 真实 Windows 覆盖安装/升级 | 待 CI | 本地完成 Electron 沙箱与更新助手烟测，不执行真实安装器；以 GitHub-hosted runner 的 installer smoke 与 Release 工作流为准。 |
| Manifest 签名 | 规划中 | SHA-256、大小和 GitHub Release attestation 不等于项目自有密钥签名或 Authenticode。 |
| 第三方渗透测试 | 未执行 | 未声称完成红队、模糊测试或外部安全审计。 |

## 证据

- `npm test -- --reporter=dot`：38 files / 285 tests passed（含 `tests/ipc-security.test.js`、`tests/security-policy.test.js`）。
- `npm run lint`：0 error、0 warning。
- `npm audit --audit-level=low`：0 vulnerabilities。
- `npm run test:desktop`：Electron `file://` sandboxed renderer 场景通过，无渲染器 console error；退出阶段 GPU 诊断日志不作为安全证明。
- `npm run test:updater`：真实助手运行时、缺少运行文件失败保护通过。
