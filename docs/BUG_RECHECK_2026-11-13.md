# Bug 复查与剩余不足

2026-11-13（Asia/Shanghai）。本次在上轮未提交工作区上继续核查，保留既有改动、`.evolution/` 和用户文件。版本仍为 0.0.4，无新增依赖、提交、推送或发布。

## 已复现并修复

| 优先级 | 原问题与复现 | 修复 | 证据 |
|---|---|---|---|
| P1 | JSON 美化 / 压缩将 `9223372036854775807` 改为 `9223372036854776000`，`1e999` 改为 `null`；单独工具和批量模式均存在 | 校验语法后直接格式化原始标记，保留数字、转义、键顺序及重复键 | 原值对照单测、UI 编辑器值与实际下载文件断言 |
| P1 | 排序 / 清理会重新序列化并改坏高精度数字，还会丢弃重复键 | 结构修改前检查数字能否往返及键是否重复；拒绝时原输入不动 | 大整数、小数、溢出 / 下溢、负零、转义同名键等单测和浏览器拒绝行为 |
| P1 | 多个工具直接调用 clipboard Promise，拒绝权限后仍显示成功，且可能产生未处理异常 | 14 个组件调用公共 `copyText`，只在写入完成后更新成功状态；API 缺失和权限拒绝均给出失败提示 | 单测验证 Promise 时序，浏览器注入权限拒绝，无页面异常与假成功 |
| P2 | UUID 直接调用 `crypto.randomUUID()`，普通局域网 HTTP 下 API 不存在 | 有原生 API 时沿用；否则用 `getRandomValues` 生成字节并设置 UUID v4 版本 / 变体位，不使用 Math.random | 在真实非安全 HTTP origin 中验证 `isSecureContext=false`、API 为 undefined，仍生成 5 个有效 v4 UUID |
| P2 | 密码取消所有类型后，程序擅自回退为字母数字；选中的类型也可能在结果中缺失 | 空集合显示错误并禁用复制；每类至少一个后安全打乱，随机索引使用拒绝采样 | 最短 / 最大长度、单一 / 全部类别、随机源缺失 / 异常单测及浏览器切换 |
| P2 | `&#X41;` 原样保留，但 `&#65abc;` 被部分读成 `A` | 数字实体使用完整的十进制或大小写十六进制模式，非法形式保持原样 | 实体回归测试 |
| P2 | JSON 递归统计遇到深层输入可能栈溢出；修改输入后仍保留旧 TypeScript 结果 / 错误 | 统计改为显式栈；美化 / 结构操作最多 256 层，深层仍能压缩；输入更改后清空旧状态 | 浏览器输入 5000 层数组，统计和压缩无异常，受限操作明确报错 |
| P2 | 批量搜索只检查截断后的来源标签，60 字符之后的来源关键词搜不到；预览正则扫描完整大结果 | 搜索使用完整来源，预览先截取最多 1024 字符再归一化空白 | 来源后缀检索浏览器断言；预览不再全串扫描 |

语义边界：JSON 排序 / 清理遇到危险数字或重复键时是明确拒绝，不代表已经实现任意精度的结构编辑。无损美化与压缩仍然可用。密码算法保证选中类别出现，但没有声称在所有满足条件的密码集合上均匀采样或提供经认证的熵评估。

## 重要文件

- `src/utils/jsonText.js`：保留标记的 JSON 格式化、数字往返 / 重复键 / 深度检查。
- `src/components/tools/jsonTool.js`、`ToolJson.vue`、`src/utils/batchProcessing.js`：接入无损文本处理和安全结构操作。
- `src/utils/randomTools.js`、`ToolPassword.vue`：密码校验、安全抽样、UUID 回退与错误状态。
- `src/utils/clipboard.js` 与 14 个调用组件：集中处理浏览器写入确认和失败。
- `src/utils/htmlEntities.js`、`ToolBatch.vue`：实体解析与搜索 / 预览边界。
- `tests/jsonText.test.js`、`randomTools.test.js`、`clipboard.test.js`、`htmlEntities.test.js`：行为回归。
- `tests/browser/regression_smoke.py`：新增 7 组真实浏览器验证，无日常浏览器资料访问。

## 仍有不足

1. **P1，发布与平台验收**：安装 / 更新 / 回滚、签名认证和 Android / iOS / macOS 真机仍没有本轮证据；不能以渲染器或网页通过代替这些验收。
2. **P1，依赖风险未知**：上轮 npm 镜像审计接口不支持、官方接口连接重置，未取得有效漏洞库报告。本次没有把已有安装可用误报为依赖安全审计通过。
3. **P2，颜色转换能力有限**：只接收 HEX，RGB / HSL 是输出形式，Alpha 固定 1；尚不支持 RGB / HSL 反向输入、可调透明度。已同步更正工具描述和 README，避免“全格式互转”误导。
4. **P2，文本操作有限**：大小写操作目前只有转小写，没有转大写或首字母模式；入口已明确写成“转为小写”。没有自动添加未经需求验证的大量模式。
5. **P2，大输入性能**：批量计算在 Worker 内，但复制 / 导出、完整结果搜索和独立 JSON / Diff / 图片操作仍可能在大输入时占用主线程；尚未做统一硬件峰值内存基准。
6. **P2，历史状态债务**：仍有 10 条既有 computed 副作用 lint 警告；全局模态焦点、读屏和全面对比度验收尚缺。
7. **P3，离线与扩展**：没有 Service Worker 离线重开保证、二维码识别、受控第三方插件协议；本轮未创建假入口。

## 验证结果

| 检查 | 状态 | 结果 |
|---|---|---|
| `npm test -- --reporter=dot` | PASS | 26 个文件、213 项测试；相对上轮新增 44 项 |
| `npm run lint` | PASS | 0 errors、10 条既有 warning；新测试字符串转义 lint 问题已修复 |
| `npm run test:desktop` | PASS | Vite 构建和隐藏 Electron 沙箱内 `file://` Worker 哈希断言通过 |
| `python tests/browser/batch_smoke.py --url http://127.0.0.1:4186 --artifacts .tmp-verify/recheck-browser` | PASS | 原有 11 组场景回归，生产构建、21 工具入口、取消 / 下载 / 多尺寸检查通过 |
| `python tests/browser/regression_smoke.py --url http://127.0.0.1:4186` | PASS | 新增 7 组场景；无页面异常，包含真实非安全上下文与 API 缺失 |
| `git diff --check` | PASS | 无补丁空白错误 |
| 真机、签名、安装更新和远程 CI | 未执行 | 没有相应验收结果，不标为通过 |

浏览器脚本使用已有 Python 3.14 / Playwright / Chromium，对已运行的本地生产服务操作；Browser 插件缺失运行文件，沿用上轮经过技能路由后的独立 Playwright 方式。原始检查摘要保存在忽略的 `.tmp-verify/regression-results.json` 和 `.tmp-verify/recheck-browser/`，不会将测试产物作为发布文件。

相关平台语义依据：[MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)、[getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)、[JSON.parse 数字精度说明](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)。修复结论同时由本地复现与回归测试支持。
