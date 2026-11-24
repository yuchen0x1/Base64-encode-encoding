# 命令行版

从 [GitHub Releases](https://github.com/yuchen0x1/Base64-encode-encoding/releases/latest) 下载当版 `GeekToolbox-CLI-<实际版本>.mjs`。在 Windows、Linux 或 macOS 上安装 Node.js 22 或更新版本后运行，无需安装 npm 依赖。

可用 GitHub CLI 自动选择最新版文件名，避免文档中的版本号滞后：

```sh
mkdir -p geek-toolbox-cli
gh release download --repo yuchen0x1/Base64-encode-encoding \
  --pattern 'GeekToolbox-CLI-*.mjs' --dir geek-toolbox-cli
```

下载后以下命令中的 `<实际版本>` 使用文件名里的真实版本号。

```sh
node GeekToolbox-CLI-<实际版本>.mjs --version
node GeekToolbox-CLI-<实际版本>.mjs --help
node GeekToolbox-CLI-<实际版本>.mjs run --step json-minify --input "input data.json"
node GeekToolbox-CLI-<实际版本>.mjs run --recipe desktop-recipe.json --input input.txt
```

省略 `--input` 或传 `--input -` 时读取标准输入。可重复提供 `--step`，程序按顺序处理最多 8 步。Windows 桌面版可在批量处理页导出同一配方文件。

每次处理一个输入，最多 64 MiB。哈希和 Base64 编码可处理二进制，文本操作要求合法 UTF-8。输出保留原样写到 stdout，程序不会补换行。失败时退出码为 1，错误写到 stderr。

## 更新与验证

`node GeekToolbox-CLI-<实际版本>.mjs --check-update` 主动查询官方稳定发布，输出版本、下载链接、大小及 SHA-256。下载后校验文件，再替换旧脚本。处理文件或管道时保持离线。

```sh
gh release verify-asset <发布标签> <CLI 文件名> -R yuchen0x1/Base64-encode-encoding
```

从源码本地验证可运行 `npm run build:cli` 和 `npm run test:cli`。生成的文件位于 `dist-cli/`，其中附带项目与内嵌 CryptoJS 的许可文本。
