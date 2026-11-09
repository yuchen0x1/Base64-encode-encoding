import { ref } from 'vue'

/**
 * 全局主题状态管理（单一数据源）
 * - isDark：全局深浅色状态
 * - applyTheme：把主题同步到 <html> 的 dark/light 类名与 color-scheme
 *   （color-scheme 让原生控件——下拉框、滚动条、checkbox 等——跟随主题）
 * - toggleTheme：切换主题
 *
 * 注意：所有主题切换必须经过这里，避免多处操作 DOM 类名导致样式残留。
 */
const isDark = ref(true)

export function applyTheme(dark) {
  isDark.value = !!dark
  const root = document.documentElement
  root.classList.toggle('dark', isDark.value)
  root.classList.toggle('light', !isDark.value)
  root.style.colorScheme = isDark.value ? 'dark' : 'light'
}

export function toggleTheme() {
  applyTheme(!isDark.value)
}

export function useTheme() {
  return { isDark, applyTheme, toggleTheme }
}
