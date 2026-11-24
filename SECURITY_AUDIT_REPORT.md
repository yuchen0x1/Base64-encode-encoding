# 安全审计报告

审计日期：2026-11-25（America/New_York）
版本：`v0.1.2` 候选（未发布；继承 v0.1.1 / v0.1.0 安全基线）
范围：Electron 主进程 / preload / 更新器、Worker 生命周期、localStorage 迁移保护、渲染界面 CSP、命令与工具依赖、发布健康工作流。
边界：本报告记录代码与自动化证据；不等同于第三方渗透测试、模糊测试或完整应用内自动更新端到端测试。Windows 安装生命周期和发布资产验证结果见下方 Actions 记录。

## 结论

当前候选继承并回归验证 Electron 最小权限边界：更新 IPC 调用必须通过主窗口主 frame 与受信文档校验，preload 不暴露 `ipcRenderer`，外链仅允许官方 HTTPS 白名单，导航、webview、设备权限和 CSP 均已收紧。本轮生产 CSP 实际构建产物仅允许 `connect-src 'self'`；Worker 失败边界、损坏状态保护和导出 URL 生命周期均有回归验证。

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
- 大于 1 MiB 的 JSON 操作使用 Worker，最多处理 32 MiB；Worker 故障时大文档明确报错，不在渲染主线程同步重跑。
- 二维码 WASM 随独立 Worker 按首次扫描加载；取消、无效替换和卸载会阻断过期任务继续创建 Worker。
- localStorage 只迁移缺少 schemaVersion 的 legacy 记录；损坏、显式非法或未来版本数据保持原值，并暂停后续写入。
- Blob 下载 URL 延迟释放；复制文本统一校验空内容、Clipboard API 和 legacy fallback。

## 风险与未闭环项

| 风险 | 状态 | 说明 |
|---|---|---|
| WASM 编译豁免 | 已接受 | `'wasm-unsafe-eval'` 仅用于本地内联 ZXing reader；输入为本地图片，但仍是 CSP 的受控例外。 |
| 极长单行 JSON 的 Renderer 内存 | 已复现，P1 未闭环 | 独立 JSON-only renderer 加载 5,247,010 字节单行数字数组；重复 smoke 的打开后 / 校验后 / 美化后 private memory 包括 50.1 / 504 / 616.8 MiB、45.5 / 500.1 / 611.5 MiB，以及 47.3 / 501.4 / 3,170 MiB，最高 peak working set 3,297.2 MiB。`wrap="off"` 仍不能消除放大；结果波动显著，不能据此设定稳定上限。原因尚未确证，也未确认持续泄漏；32 MiB 文本限制不等于内存预算。EV-057 有回归烟测，但渲染策略和可接受预算待定。 |
| 第三方渗透测试 | 未执行 | 未声称完成红队、模糊测试或外部安全审计。 |

## 证据

- `npm test -- --reporter=dot`：42 files / 310 tests passed（含 IPC、Worker RPC、存储迁移、CSP 与 URL 生命周期专项测试）。
- `npm run lint`：0 error、0 warning。
- `npm audit --registry=https://registry.npmjs.org --audit-level=low`：0 vulnerabilities（含开发依赖）。
- `npm run test:desktop`：Electron `file://` renderer 的批处理 Worker、首次扫描 2048 × 2048 二维码、取消竞态、5 MiB 多行 JSON Worker 成功与失败边界、JSON 操作互斥和 KeepAlive 资源释放均通过，无渲染器 console error。最新多行 JSON 校验/美化为 218/64 ms，Renderer private memory 为 125.4/259 MiB，working-set peak 366.6 MiB。独立 JSON-only 单行压力烟测通过，但重复采样从 611.5 MiB 波动到 3,170 MiB private memory，peak working set 最高 3,297.2 MiB；详见升级报告。
- `npm run package:win`：本地 Windows x64 NSIS 安装包构建通过；候选版隔离覆盖安装、回滚和卸载由 PR #21 的 Windows installer run 45429273392 实际验证。
- `npm run test:updater`：真实助手运行时、缺少运行文件失败保护通过。
- 既有 [Release run 45391803298](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45391803298) 与 [PR run 45393215151](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45393215151) 已实际验证 v0.1.0→v0.1.1 覆盖升级、配置保留、故障恢复、启动和卸载；这属于 v0.1.1 生命周期证据，不替代本候选自己的 PR / Release run。
- 候选 PR #21 仍为 Draft；[Quality Gate run 45429273095](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45429273095) 的 Windows quality、三系统 CLI 和 dependency review 全部通过（macOS job 单项重跑后通过）。[Windows installer run 45429273392](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45429273392) 完成 NSIS 构建、CRC 校验、v0.1.1→v0.1.2 覆盖安装、profile 保留、强制版本不匹配回滚至 v0.1.1、启动和卸载。尚无正式 Release、Tag 或发布资产证明；EV-057 的长行内存风险仍阻止合并发布。
