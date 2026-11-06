import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './', // 确保在 Electron 和本地文件协议 (file://) 中资源路径正确
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
})
