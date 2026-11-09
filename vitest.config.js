import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 纯 Node 环境即可运行：shared/ 为纯逻辑，组件与工具模块仅在导入期被解析，
// 不依赖 DOM；需要 DOM 的交互测试可后续加入 jsdom 环境。
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js']
  }
})
