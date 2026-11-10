/**
 * 社区 / 反馈入口配置（单一事实来源）
 *
 * 交流群地址、仓库地址只在本文档内维护，界面（App.vue / FeedbackModal.vue）与
 * 文档（README.md）共用同一份数据，后续换群或换号只需改这一处。
 */

export const QQ_GROUP = {
  name: '冷漠网络科技交流群①',
  /** 官方一键加群链接，点击后跳转 QQ 加群页 */
  url: 'https://qm.qq.com/q/bkacrv1t3G',
  displayUrl: 'qm.qq.com/q/bkacrv1t3G',
  /** 群定位，用于弹窗内的能力标签 */
  purposes: ['问题反馈', '功能建议', '版本更新通知'],
  tip: '点击「一键加入」会调用系统默认浏览器打开 QQ 加群页，在 QQ 客户端内确认即可入群。'
}

export const REPO_URL = 'https://github.com/yuchen0x1/Base64-encode-encoding'
export const ISSUE_URL = `${REPO_URL}/issues`

/** 是否运行在 Electron 桌面端（preload 桥只暴露 toolboxUpdater） */
export function isElectronRuntime() {
  return typeof window !== 'undefined' && window.toolboxUpdater?.platform === 'electron'
}

/** 是否运行在 Capacitor 原生容器（Android / iOS） */
export function isNativeContainer() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

/**
 * 统一外链打开入口。
 *
 * - Electron：window.open / target=_blank 会被主进程 setWindowOpenHandler 拦截并交给
 *   shell.openExternal，在系统默认浏览器中打开，不会把 App 自身导航走
 *   （electron/main.js 已做安全审计）。这里统一用隐藏 <a> 触发，行为与用户点击一致。
 * - 浏览器 / PWA：新标签页打开，弹窗被拦截时再用隐藏 <a> 兜底。
 * - Capacitor 原生容器：WebView 内直接跳转会把 App 页面顶掉且无法返回，
 *   因此不做跳转，返回 'blocked' 交由调用方提示「复制链接到 QQ 打开 / 扫码入群」。
 *
 * @param {string} url
 * @returns {'opened'|'fallback'|'blocked'} opened=已交给外部打开；fallback=弹窗被拦、已用 <a> 兜底；blocked=未跳转
 */
export function openExternalLink(url) {
  if (!url) return 'blocked'
  if (isNativeContainer()) return 'blocked'

  if (isElectronRuntime()) {
    clickHiddenAnchor(url)
    return 'opened'
  }

  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer')
    if (win) return 'opened'
  } catch {
    /* 弹窗被拦截 → 走 <a> 兜底 */
  }

  return clickHiddenAnchor(url) ? 'fallback' : 'blocked'
}

function clickHiddenAnchor(url) {
  try {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return true
  } catch {
    return false
  }
}

/**
 * 复制文本到剪贴板（http 环境下 navigator.clipboard 不可用，故保留 execCommand 降级）。
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 权限被拒时走降级方案 */
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
