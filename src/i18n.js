export const LOCALES = ['zh-CN', 'en-US']

export function resolveLocale(setting, candidates = []) {
  if (setting === 'zh-CN' || setting === 'en-US') return setting
  for (const candidate of (candidates.length ? candidates : ['zh-CN'])) {
    const value = String(candidate).toLowerCase()
    if (value === 'en' || value.startsWith('en-')) return 'en-US'
    if (value === 'zh' || value.startsWith('zh-')) return 'zh-CN'
  }
  return 'zh-CN'
}

export function localeLabel(locale) {
  return locale === 'en-US' ? 'English' : '简体中文'
}
