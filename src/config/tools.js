export const toolCategories = [
  { id: 'all', name: '全部工具', icon: 'LayoutGrid' },
  { id: 'common', name: '常用高频', icon: 'Sparkles' },
  { id: 'encode', name: '编码与解码', icon: 'Binary' },
  { id: 'crypto', name: '哈希与加密', icon: 'ShieldCheck' },
  { id: 'json', name: 'JSON & 代码', icon: 'FileCode2' },
  { id: 'text', name: '文本与正则', icon: 'FileText' },
  { id: 'math', name: '数字与进制', icon: 'Calculator' },
  { id: 'time', name: '时间与日期', icon: 'Clock' },
  { id: 'media', name: '图片与媒体', icon: 'Image' }
]

export const toolsList = [
  {
    id: 'base64',
    name: 'Base64 编解码',
    category: 'encode',
    description: '支持纯文本与 URL 安全模式的 Base64 实时编码与解码',
    tags: ['base64', 'encode', 'decode', '编码', '解码'],
    icon: 'Binary',
    isCommon: true
  },
  {
    id: 'jwt-decoder',
    name: 'JWT 令牌解析 & 时效诊断',
    category: 'encode',
    description: 'Header / Payload 全息解析，支持 iat/nbf/exp 标准时效生命周期审计',
    tags: ['jwt', 'token', 'decode', '鉴权', '令牌', 'json web token'],
    icon: 'ShieldCheck',
    isCommon: true
  },
  {
    id: 'unicode-codec',
    name: 'Unicode & HTML 实体互转',
    category: 'encode',
    description: '中文 Unicode 转义 (\\u4e2d\\u6587) 与 HTML 字符实体 (&lt;&gt;&#x;) 编解码',
    tags: ['unicode', 'html', 'entities', '转义', '字符实体'],
    icon: 'FileCode2',
    isCommon: true
  },
  {
    id: 'cipher-toolbox',
    name: '全系 Base 族与黑客密码',
    category: 'encode',
    description: 'Hex (十六进制)、Base32、摩斯电码 (Morse Code)、ROT13 凯撒密码互转',
    tags: ['hex', 'base32', 'morse', 'rot13', '摩斯密码', '十六进制'],
    icon: 'Binary',
    isCommon: true
  },
  {
    id: 'image-base64',
    name: '图片 与 Base64 互转',
    category: 'media',
    description: '本地图片拖拽秒转 DataURL Base64 代码，Base64 还原图片渲染与下载',
    tags: ['image', 'base64', 'dataurl', '图片转base64', '还原'],
    icon: 'Image',
    isCommon: true
  },
  {
    id: 'url-codec',
    name: 'URL 编解码',
    category: 'encode',
    description: 'URL Encode / Decode，支持 encodeURI 与 encodeURIComponent 模式',
    tags: ['url', 'uri', 'encode', 'url编码', '解码'],
    icon: 'Globe',
    isCommon: true
  },
  {
    id: 'json-format',
    name: 'JSON 格式化 & 校验',
    category: 'json',
    description: 'JSON 语法高亮、美化排版、压缩、键值转义与结构错误定位',
    tags: ['json', 'format', 'minify', '格式化', '校验'],
    icon: 'FileCode2',
    isCommon: true
  },
  {
    id: 'hash-crypto',
    name: '摘要哈希计算 (MD5/SHA/HMAC)',
    category: 'crypto',
    description: '支持 MD5, SHA-1, SHA-256, SHA-512, HMAC 等多种散列算法',
    tags: ['md5', 'sha', 'sha256', 'hmac', '哈希', '加密'],
    icon: 'Hash',
    isCommon: true
  },
  {
    id: 'aes-crypto',
    name: 'AES 对称加密/解密',
    category: 'crypto',
    description: '支持 CBC/ECB 模式、多种填充方式与密钥 IV 的在线加解密',
    tags: ['aes', 'crypto', 'decrypt', 'encrypt', '对称加密'],
    icon: 'Lock',
    isCommon: false
  },
  {
    id: 'timestamp',
    name: 'Unix 时间戳转换',
    category: 'time',
    description: '秒/毫秒时间戳与当前北京时间实时互转，支持一键获取当前时间',
    tags: ['timestamp', 'unix', 'time', '时间戳', '日期'],
    icon: 'Clock',
    isCommon: true
  },
  {
    id: 'regex-tester',
    name: '正则表达式测试器',
    category: 'text',
    description: '常用正则表达式大全、在线匹配测试、捕获组提取与高亮显示',
    tags: ['regex', 'regexp', '正则', '匹配', '提取'],
    icon: 'Regex',
    isCommon: true
  },
  {
    id: 'text-diff',
    name: '文本代码对比 (Diff)',
    category: 'text',
    description: '左右文本差异高亮比对，逐行逐字精准显示新增、删除与修改',
    tags: ['diff', 'compare', '文本对比', '代码比对'],
    icon: 'GitCompare',
    isCommon: true
  },
  {
    id: 'radix-convert',
    name: '多进制转换',
    category: 'math',
    description: '二进制 (Bin)、八进制 (Oct)、十进制 (Dec)、十六进制 (Hex) 实时互转',
    tags: ['radix', 'binary', 'hex', 'dec', '进制转换', '二进制', '十六进制'],
    icon: 'Cpu',
    isCommon: true
  },
  {
    id: 'qrcode-generator',
    name: '二维码生成与解析',
    category: 'media',
    description: '在线生成高清晰度二维码，支持容错率调整与 PNG 导出下载',
    tags: ['qrcode', 'qr', '二维码', '生成'],
    icon: 'QrCode',
    isCommon: true
  },
  {
    id: 'random-password',
    name: '随机密码 & UUID 生成器',
    category: 'crypto',
    description: '快速生成强密码、随机字符串、GUID / UUID v4，批量生成',
    tags: ['uuid', 'guid', 'password', 'random', '密码生成', '随机数'],
    icon: 'KeyRound',
    isCommon: true
  },
  {
    id: 'text-toolbox',
    name: '文本去重 & 统计处理',
    category: 'text',
    description: '行去重、字母大小写转换、字数/字符数/行数统计、空行清除',
    tags: ['text', 'count', 'unique', '文本统计', '去重'],
    icon: 'AlignLeft',
    isCommon: false
  },
  {
    id: 'jwt-generator',
    name: 'JWT 令牌生成器 (HS256)',
    category: 'encode',
    description: '自定义 Header/Payload，自动注入 iat/exp 时效声明，HS256 签名生成',
    tags: ['jwt', 'token', 'generate', 'hs256', '签名', '生成'],
    icon: 'KeyRound',
    isCommon: true
  },
  {
    id: 'color-converter',
    name: '颜色格式转换器',
    category: 'media',
    description: 'HEX / RGB / RGBA / HSL 全格式互转，带实时取色器与调色板',
    tags: ['color', 'hex', 'rgb', 'hsl', '颜色', '取色'],
    icon: 'Palette',
    isCommon: true
  },
  {
    id: 'escape-toolbox',
    name: '转义字符工具',
    category: 'encode',
    description: 'C 风格、Unicode (\\uXXXX)、Hex (\\x41) 转义与还原互转',
    tags: ['escape', 'unescape', '转义', '字符串', 'special char'],
    icon: 'Braces',
    isCommon: true
  },
  {
    id: 'sql-formatter',
    name: 'SQL 格式化工具',
    category: 'json',
    description: '离线美化、压缩常用 SQL 查询，仅处理文本，不执行任何数据库操作',
    tags: ['sql', 'format', 'minify', 'query', '数据库', '格式化'],
    icon: 'Database',
    isCommon: true
  }
]
