# 安全审计报告

审计日期：2026-11-25（Asia/Shanghai）
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
- 更新器所有 HTTP 请求显式省略凭据；公开 GitHub Release 资产才会生成 GH-Proxy 及已核验备用路线，每一跳重定向都在继续请求前限制到 GitHub/CDN、当前代理主机或自定义源原主机范围内，并校验 Range 起点、总大小、包体大小和 SHA-256。
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
| 极长单行 JSON 的 Renderer 内存 | 已缓解，持续跟踪 | 5,247,010 字节单行数字数组的美化结果现在受 100,000 行预算保护，超限在 Worker 内拒绝且 textarea 输入保持不变；本轮 smoke 的格式化阶段 peak working set 约 515 MiB。单行输入校验仍观测到约 503 MiB private memory，需后续多机基准，不将其写成稳定上限。 |
| 第三方渗透测试 | 未执行 | 未声称完成红队、模糊测试或外部安全审计。 |

## 证据

- `npm test -- --reporter=dot`：42 files / 328 tests passed（含 IPC、Worker RPC、存储迁移、CSP、URL 生命周期、代理探测速率评分与动态选线、官方优先和完整低速包不切换、旧版更新提示和长行 JSON 保护专项测试）。
- `npm run lint`：0 error、0 warning。
- `npm audit --registry=https://registry.npmjs.org --audit-level=low`：0 vulnerabilities（清空本机代理环境后直连执行，含开发依赖）。
- `npm run test:desktop`：Electron `file://` renderer 的批处理 Worker、首次扫描 2048 × 2048 二维码、取消竞态、5 MiB 多行 JSON Worker 成功与失败边界、长行美化保护、JSON 操作互斥和 KeepAlive 资源释放均通过，无渲染器 console error。最新多行 JSON 校验/美化为 307/78 ms，Renderer private memory 为 199.4/224.9 MiB，working-set peak 322 MiB；JSON-only 单行压力烟测拒绝美化，格式化保护阶段 peak working set 为 514.1 MiB。
- Windows x64 NSIS：独立临时输出目录完成候选包构建，111,918,875 bytes，ProductVersion `0.1.2`，SHA-256 `9C3874F0A116F020EC27D6F78C28F89A6391543273D39732BD0B028D8EE62D28`；本地候选产物，非正式 Release 资产。
- `npm run test:updater`：使用最终构建的 unpacked app EXE，真实助手运行时、EXE-only 失败保护和独立 Node runtime 探针通过。
- 代理线路探测：本地模拟测试验证 Range 响应边界、速度评分和动态选择；无中国大陆真实网络测速证据。
- 既有 [Release run 45391803298](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45391803298) 与 [PR run 45393215151](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45393215151) 已实际验证 v0.1.0→v0.1.1 覆盖升级、配置保留、故障恢复、启动和卸载；这属于 v0.1.1 生命周期证据，不替代本候选自己的 PR / Release run。
- 候选 PR #21 仍为 Draft；既有 [Quality Gate run 45439749550](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45439749550) 与 [Windows installer run 45439749767](https://github.com/yuchen0x1/Base64-encode-encoding/actions/runs/45439749767) 只覆盖更新前 PR head，不能替代本轮代码推送后的远程门禁。尚无正式 Release、Tag 或发布资产证明。
