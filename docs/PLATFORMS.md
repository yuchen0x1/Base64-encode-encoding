# 平台可行性与路线图

审计基线为 `16abbc8` / v0.0.8。v0.0.7 已主动收敛桌面、移动及网页旧发布范围。评估以 21 款本地工具、桌面工作区和已存在的 Windows 安装用户为基线。A 为继续维护，B 为本轮新增，C 为有条件候选，D 为当前产品能力或权限模型不合适。

| 目标 | 评级 | 功能、交互和运行前提 | 分发、成本与生命周期 |
|---|---|---|---|
| Windows 11 x64 | A | Electron 原生 Windows 窗口，21 项工具、键鼠、拖放文件、工作区和 IPC 更新 | 现有 NSIS 与 Win Runner，维护成本低。通过 GitHub 统一更新 |
| Windows 10 x64 | A | 共用 Windows 包。Windows 10 真机兼容需独立验证 | 同一 NSIS 与更新源。旧系统和运行时需定期复测 |
| Windows ARM64 桌面 | C | 原生包需 Electron ARM64 运行时、架构资产路由与设备验收 | 当前无独立安装包，复评要有 ARM64 测试环境 |
| Linux 通用桌面 | C | 工具核心可移植，托盘、沙箱、系统剪贴板和 file 协议需适配 | AppImage 仍需分发与升级生命周期，独立 GUI 维护增量高 |
| Ubuntu / Debian 桌面 | C | DEB、桌面注册、Wayland / X11 和系统库需验证 | 需要 apt 分发、仓库签名和升级测试 |
| Fedora 桌面 | C | 工具可用性取决于运行时、SELinux 与桌面权限 | RPM 或 Flatpak 需额外签名、沙箱和生命周期 |
| Arch Linux 桌面 | C | Electron 系统包与滚动更新需要兼容测试 | AUR/PKGBUILD 需要维护，CLI 可通过 Node.js 使用 |
| macOS Intel 桌面 | C | GUI 可移植，原生快捷键、窗口与文件权限需适配 | DMG、Developer ID、公证、Intel 硬件与更新验证均需资源 |
| macOS Apple Silicon 桌面 | C | arm64 UI 与权限可适配，需要独立的桌面验收 | DMG、签名、公证及更新和恢复成本高；CLI 已有交付路径 |
| CLI（Windows / Linux / macOS） | B | 管道、文件和配方流程适合终端与自动化。九种共享步骤，Node.js 22+ | 单文件资产附 SHA-256，三系统测试，主动检查并替换 |
| Android 手机 | C | 算法可共享，输入法、SAF、剪贴板和后台调度需要原生设计 | 签名、商店或 APK 更新与设备维护成本高 |
| Android 平板 | C | 文件可通过 SAF，双栏和触控需专门适配 | 与手机共享发布，另需大屏测试 |
| Android 折叠屏 | C | 姿态变化、窗口尺寸和任务恢复需测试 | 需要真实折叠屏或等效系统验证 |
| iOS / iPadOS | C | 本地算法可用，沙箱、后台和文档选择限制桌面式多文件流 | 需要苹果签名、真机和 App Store 审查，iPad 分屏另测 |
| 桌面 Web | C | 可实现大多数纯计算工具；无 Windows 安装 IPC，文件和剪贴板依赖浏览器权限 | 独立站需维护 CSP、缓存和部署渠道。已保留 Vite 开发预览 |
| 移动 Web / 响应式 Web | C | 本地计算可用，移动文件和资源限制需专项交互与测量 | 底层可复用，独立产品收益与移动端需求再评估 |
| PWA | C | 需新增 Worker、缓存版本、离线首启、更新确认及数据恢复测试 | 需要 HTTPS 部署和跨浏览器缓存回归 |
| Chrome / Edge 扩展 | C | 局部工具适配扩展页，Windows 本地生命周期不可用 | 商店签名和审核增量高，需明确扩展专属用途 |
| Firefox 扩展 | C | WebExtension 兼容需单测，浏览器存储及权限有差异 | 独立签名、审核与兼容性维护 |
| Docker / NAS | C | CLI 可在已有 Node 环境运行；Web 服务须新建认证、上传和资源调度 | 当前无持续运行服务需求，后续按批处理用户反馈评估 |
| 私有化 / 云服务器 | D | 核心产品强调本机处理，云上传会改变隐私边界并引入租户隔离及留存 | 当前无服务端、数据存储或运维预算 |
| 其他桌面格式 | C | MSI、便携包、Flatpak 与 Windows NSIS/Node CLI 生命周期不同 | 明确企业部署或平台渠道需求后再做 |

系统矩阵中的 CLI 表示 Node.js 运行形态。发行版、macOS 双架构、Windows 10 真机、Windows ARM64、各种终端和输入法仍需按目标环境验收。各平台版本统一来自 `package.json`。共享配方兼容性由桌面测试与独立 CLI 冒烟共同保护。
