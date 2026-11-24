import { copyText } from '../utils/clipboard.js'

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

/** 通过主进程的导航拦截，在系统默认浏览器中打开外链。 */
export function openExternalLink(url) {
  if (!url) return 'blocked'
  return clickHiddenAnchor(url) ? 'opened' : 'blocked'
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
  return copyText(text, { reportFailure: false })
}
