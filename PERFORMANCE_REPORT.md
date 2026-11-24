# 性能报告

报告日期：2026-11-24（Asia/Shanghai）  
版本：`v0.1.1`（性能实现未变；更新后的重新构建测量）
环境：本地 Windows 工作区，Node.js 22 系列、Vite 8.3.8、Electron 45.4.1。  
口径：记录当前构建可复现的产物大小和实际测试耗时；没有稳定基准样本时不编造加速比。

## 生产构建

`npm run build` 成功，1903 个模块转换完成。主入口 JS 为 203.28 kB（gzip 75.71 kB），主 CSS 为 42.23 kB（gzip 7.98 kB）。21 款工具均生成按需加载的分包；二维码工具因内联 ZXing reader WASM，分包为 1,308.32 kB（gzip 544.63 kB），Vite 给出超过 500 kB 的非失败警告。

按需加载避免把工具代码全部放入首屏主包。二维码识别依赖在 `file://` 下必须离线可用，因此选择随工具分包内联 WASM，而不是增加运行时网络请求；代价是该工具首次加载体积较大。

## 测试与烟测耗时

| 检查 | 结果 | 实际耗时 |
|---|---|---|
| `npm test -- --reporter=dot` | 38 files / 285 tests passed | 1.93 s |
| `npm run lint` | 0 error / 0 warning | 5.73 s |
| `npm run build` | 成功 | 3.69 s |
| `npm audit --audit-level=low` | 0 vulnerabilities | 3.95 s |
| `npm run test:cli` | 5 tests passed | 2.15 s |
| `npm run test:updater` | 3 项真实进程检查通过 | 8.57 s |
| `npm run test:desktop` | file:// 沙箱场景通过 | 4.07 s（含构建） |

## 尚未量化

- 没有稳定硬件基线与多次采样，因此未宣称冷启动、内存峰值或批处理吞吐的百分比改善。
- Windows 安装包体积、真实安装耗时和旧版升级性能以 CI 构建产物与 Release 资产为准。
- 命令面板的筛选复杂度有单元测试覆盖，但未在 1000 条命令的真实设备上做帧率测量。
