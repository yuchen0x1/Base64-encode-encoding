import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    // 构建产物、原生工程与临时目录不参与源码 lint
    ignores: [
      'dist',
      'release',
      'node_modules',
      '.tmp-verify',
      '.tmp-release',
      'android',
      'ios',
      'updates',
      'coverage',
      '.github'
    ]
  },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // 由 Vite 构建期注入（vite.config.js 的 define），lint 阶段按只读全局处理
        __APP_VERSION__: 'readonly',
        __BUILD_TIME__: 'readonly'
      }
    }
  },
  {
    rules: {
      // 单文件工具组件（如 ToolBase64）属本项目命名惯例
      'vue/multi-word-component-names': 'off',

      // 既有代码采用紧凑的单行模板风格，以下纯格式规则与既有风格冲突，统一关闭以免噪音
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',

      // 工具组件的 output computed 同时负责重置/写入 error 状态，是本项目有意为之的模式；
      // 逐组件改造风险较高，保留为可见告警（warn），列为已知技术债（见审计报告）
      'vue/no-side-effects-in-computed-properties': 'warn',

      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off'
    }
  }
]
