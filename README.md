# 极客工具箱（Geek Toolbox）

一个面向开发者的跨端工具箱，提供常用的编码、加密、哈希、文本、JSON、正则、颜色、二维码和批量处理工具。项目基于 Vue 3 + Vite 构建，可运行于浏览器、Electron 桌面端，以及 Capacitor Android / iOS 容器。

## v1.2.0

- 修复浅色模式下输入框、面板头、哈希卡片等区域残留深色样式的问题。
- 新增网页版与桌面版一键更新：检查、说明展示、下载、SHA-256 校验、替换、重启。
- 新增「批量处理」工具：支持多行文本与多文件拖拽，批量 Base64 / URL 编解码、MD5 / SHA 哈希、JSON 格式化与压缩，并可导出 TXT / CSV / JSON。
- 修复工具矩阵图谱中 `C++` 条目的转义显示问题。

## 功能概览

- Base64、URL、Unicode、转义、进制、时间戳等编码转换。
- MD5、SHA、AES、JWT、密码生成与常用加密辅助工具。
- JSON 格式化、压缩与校验；正则表达式、SQL、文本差异、颜色和二维码工具。
- 统一的浅色 / 深色主题，主题状态可持久化并支持首屏防闪烁。
- 批量处理结果支持搜索、状态筛选、逐条复制和文件导出。
- 浏览器模式支持本地更新服务；Electron 模式支持自动检查和增量更新。

## 本地运行

环境要求：Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

开发服务器默认地址：`http://127.0.0.1:5173/`

## 测试与代码质量

本项目已接入 Vitest 单元测试与 ESLint 静态检查：

```bash
npm test          # 运行单元测试（纯 Node 环境，覆盖版本比较、ZIP、注册表、HTML 实体）
npm run test:watch # 监听模式
npm run lint      # ESLint 检查（src / electron / server / shared / tests）
npm run lint:fix  # 自动修复可修复项
```

单元测试同时充当「工具注册表一致性自检」的护栏：新增工具时若只改了 `tools.js` 而遗漏 `src/config/registry.js`，测试与开发期运行都会立即报错。

构建生产文件：

```bash
npm run build
```

启动带更新能力的网页版服务器：

```bash
npm run serve:build
```

默认地址：`http://127.0.0.1:4173/`。Windows 用户也可以双击 `启动网页版.bat`。

启动 Electron 桌面开发版：

```bash
npm run electron:dev
```

## 发布与更新源

发布脚本会生成带版本清单和 SHA-256 校验值的网页版更新包：

```bash
npm run release
```

桌面端推荐生成增量更新包（只替换 `resources/app.asar`）：

```bash
node scripts/release.mjs --delta
```

也可以先指定版本号：

```bash
node scripts/release.mjs --version 1.3.0 --delta
```

产物位于：

- `updates/web/version.json` 与网页版 ZIP 包
- `updates/desktop/version.json` 与桌面端增量 ZIP 包

`updates/` 默认不提交到 Git。将这些文件上传到 GitHub Release、静态文件服务器或其他可访问的更新源后，在服务器启动时通过 `--feed` 指定更新源，例如：

```bash
node server/serve.js --root dist --feed updates/web
```

桌面端可以通过 `TOOLBOX_UPDATE_FEED` 环境变量或程序目录下的 `update-config.json` 指定更新源。

## 项目结构

```text
src/                    Vue 页面、组件和工具实现
electron/               Electron 主进程、预加载桥与桌面更新器
server/                 静态服务器与网页版更新接口
shared/                 版本比较、ZIP 打包与解压工具
scripts/                发布脚本
public/                 Web App 清单及静态资源
android/ ios/           Capacitor 原生工程
.github/workflows/      多平台构建工作流
```

## 安全说明

- 更新包下载后会进行 SHA-256 校验，校验失败不会替换现有文件。
- ZIP 解压包含路径穿越防护。
- 网页更新接口默认只允许本机触发更新，远程触发需要显式启用。
- 本项目中的工具默认在本地浏览器或桌面进程内处理输入，不会主动上传内容。

## 开源协议

本项目采用 [MIT License](LICENSE)。
