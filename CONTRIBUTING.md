# 贡献指南

感谢你为极客工具箱提交改进。本项目仅支持 Windows x64；Vue / Vite 用于 Electron 渲染界面，不维护独立网站或其他平台版本。

## 开始之前

```bash
npm ci
npm run electron:dev
```

## 分支约定

- 本仓库统一使用 `main` 作为开发、集成和发布基线。
- 后续代码更新直接提交到本地 `main`，并推送到 `origin/main`。
- 不保留个人功能分支、临时修复分支或已合并的远程跟踪分支；临时实验完成后应回到 `main` 并清理引用。
- 操作前先确认 `git status --short --branch`，保留工作区中已有的未提交修改，不使用强制重置覆盖它们。

提交功能或修复前，请确认生产构建通过，并在 Windows Electron 窗口中检查浅色和深色主题。

## 开发约定

- 使用 Vue 3 `<script setup>` 和现有组件结构。
- 新增 UI 颜色优先使用 `src/assets/base.css` 中的 CSS 变量，不要在组件中硬编码深色背景。
- 工具页面放在 `src/components/tools/`，并在 `src/config/tools.js` 中注册。
- 涉及版本信息时同步更新 `package.json`、`package-lock.json` 和 `release-notes.json`。
- 不要提交 `dist/`、`release/`、`updates/`、`.tmp-*` 或 `.workbuddy/` 本地产物。
- 不要在工具中上传或记录用户输入，除非需求明确要求并经过评审。

## 提交检查

```bash
npm test
npm run lint
npm run test:desktop
```

如果修改了更新流程，请同时验证：

1. 更新源清单版本高于当前版本时能正确提示；
2. SHA-256 校验失败时旧文件保持不变；
3. 安装助手确认就绪后应用才退出，更新完成后能打开新版本；
4. 安装包格式、目标路径和目标版本均经过验证；可运行 `npm run test:updater` 检查真实助手进程。

## 提交信息

推荐使用简洁的 Conventional Commits 风格，例如：

- `feat: 新增批量处理工具`
- `fix: 修复浅色主题残留深色样式`
- `chore: 更新发布配置`
