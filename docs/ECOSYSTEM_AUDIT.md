# 本轮项目审计与交付状态

审计日期为 2026-11-18。Windows 运行基线为 main 的 `16abbc8`、v0.0.8，GitHub 公开仓库、MIT、默认分支 main。开始时工作区干净。最近两次发布 v0.0.7、v0.0.8 均发布 Windows x64 NSIS 和桌面更新清单。v0.0.7 收敛前的网页、macOS、移动端和服务端资料保存在历史报告。

## 原项目基线

| 模块 | 审计入口 | 基线能力 |
|---|---|---|
| 构建和启动 | `package.json`、Vite、Electron、两份 .bat | 从静态渲染资源打开本机窗口。Electron 主进程、隔离 preload、NSIS 共用版本 |
| 界面与状态 | `src/App.vue`、`src/config/`、`src/utils/appState.js` | 导航搜索、收藏、标签、多主题、语言、目录索引、版本化工作区 JSON。偏好在 localStorage，备份不含计算输入 |
| 21 款工具 | `src/components/tools/`、`src/utils/` | Base64、JWT 解析/生成、Unicode、Base 族、图片、URL、JSON、哈希、时间、QR、进制、Diff、正则、密码、AES、文本、颜色、转义、SQL、批量配方 |
| 批处理 | `ToolBatch.vue`、batch worker、批量执行器 | 文本或本地文件、9 种操作、最多 8 步、配方导入导出、进度/停止、TXT/CSV/JSON |
| 安装更新 | `electron/updater.js`、安装助手、`build/installer.nsh` | GitHub 清单、下载进度和断点、SHA-256、可选 Authenticode、更新助手启动、NSIS 覆盖 |
| 发布和依赖 | `scripts/release.mjs`、Actions、lockfile | Vue/Vite、Electron、MIT CryptoJS、MIT qrcode、BSD-3-Clause diff。无业务后端、账户、数据库或云存储 |

原版 `npm ci`、`npm test -- --reporter=dot`（29 文件、221 测试）和 `npm run lint` 已通过。原版 Electron 界面冒烟失败。修复后确认问题由工作区带参数的翻译调用触发。原版助手实际启动及故意缺少运行文件时的失败保护通过。npm 镜像没有漏洞端点，随后使用 npm 官方源确认一项构建依赖公告及其传播路径。原生产依赖无漏洞报告。

## 主要差距与实施

- v0.0.8 启动白屏与窄品牌栏。通过双语入口、浏览和真实批量 Worker 操作回归。
- 配方未有终端运行方式。新增通用 Node.js CLI，保留既有格式和二进制语义。
- 更新只核对清单声明的安装包摘要，双启动检查可能重置下载状态。接入官方资产摘要校验并收敛后台检查。安装前及独立助手内复核。
- 远程默认分支原先未保护，Actions 读权限默认、私密漏洞报告和 Secret scanning 已开启，无 Windows 代码签名 Secrets。已启用不可变发布，工作流固定 Action SHA；PR、依赖与发布流程以维护指南和真实运行记录为准。
- 当前桌面包保留 RunAsNode fuse 供独立助手使用。ASAR 可检查，符合项目开源定位。渲染产物静态扫描未发现 source map 或硬编码凭据命中。主进程只向沙箱界面暴露更新功能。
- 安装运行与旧客户端的完整自动更新链路分别验收。失败时保护被占用的旧文件，安装过程提供重试、基于已校验旧安装包的恢复与交互修复。Authenticode 需项目证书。

[全平台评估](PLATFORMS.md) · [30 个参考项目与候选清单](ECOSYSTEM_RESEARCH.md) · [长期维护](MAINTENANCE.md) · [GitHub 运行记录](https://github.com/yuchen0x1/Base64-encode-encoding/actions)
