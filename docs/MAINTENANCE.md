# 维护状态与发布流程

| 项目 | 维护入口 | 验证和限制 |
|---|---|---|
| Windows x64 桌面 | `electron/`、`src/`、`package:win` | 21 个工具、工作区与独立 NSIS 助手。安装与应用内更新分别验收 |
| Node.js 22+ CLI | `cli/`、`shared/`、`src/utils/batchProcessing.js` | Windows、Ubuntu、macOS 各运行单文件测试，发行一个通用文件 |
| 质量与打包 | `quality.yml`、`build-all.yml` | 以 [Actions](https://github.com/yuchen0x1/Base64-encode-encoding/actions) 记录为准 |
| 稳定发布 | `release.yml` | 标签和版本/历史一致，Windows 与 CLI 全通过后创建草稿，上传、查摘要，再正式发布 |
| 依赖和安全 | Dependabot、私密漏洞报告、Dependency review、CodeQL、`maintenance.yml` | 常规门禁审核运行依赖，定时任务审计完整依赖树；CodeQL 默认设置使用扩展规则与本地/远程威胁模型 |
| 发布健康 | `maintenance.yml` | 定期下载最新资产，核对 README、SHA-256、清单和 CLI 版本，输出上游变更摘要 |

## 发布与故障

在 PR 中同步 `package.json`、锁文件、`CHANGELOG.md`、`release-notes.json`、规范发布历史和 README 最新版本段落。合并后对通过验证的主线提交打 `vX.Y.Z` 标签。手动重跑必须指定已存在的标签。发布 Job 是唯一有仓库内容写权限的 Job。

草稿校验失败时可重跑。正式发布后使用 GitHub 不可变发布保护资产和标签，发现问题后走修复 PR 与新版本。查看运行日志区分依赖问题、构建问题和安装问题。使用 SHA-256 校验资产完整性，并通过 GitHub Release Attestation 核验资产与工作流来源。Actions 中间构建产物保留 7 天；清理这些临时产物和依赖缓存不删除 Releases 的安装包或更新清单。

## 已知问题与复评

- 2026-11-27 复查当前锁文件，npm 官方源完整依赖审计为 0 漏洞；此前记录的 `picomatch@4.0.7` 告警已不影响当前依赖树。后续仍由完整审计和 Dependabot 跟踪，不能把本次结果视为永久保证。
- CryptoJS 已停止主动维护。CLI 与桌面共享其既有摘要行为，后续替换先验证字节、AES 兼容和历史配方。
- 发布 Runner 验证 NSIS 生命周期。旧版通过 UI 检查、下载并由助手安装的端到端验收及故障后的版本恢复另行记录。
- 每周报告轻量上游变化，重大版本前重新核对[竞品证据与候选清单](ECOSYSTEM_RESEARCH.md)。
