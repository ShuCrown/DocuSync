/** 全站对外链接 —— 部署地址变化时只需改这里 */
export const LINKS = {
  repo: 'https://github.com/ShuCrown/DocuSync',
  releases: 'https://github.com/ShuCrown/DocuSync/releases/latest',
  webApp: 'https://docusync.pages.dev',
} as const

export type OS = 'mac' | 'win' | 'other'

/** 依据 UA 推断当前系统，用于下载按钮文案 */
export function detectOS(): OS {
  const ua = navigator.userAgent
  if (/Mac|iPhone|iPad/.test(ua)) return 'mac'
  if (/Windows/.test(ua)) return 'win'
  return 'other'
}

export function downloadLabel(os: OS): string {
  if (os === 'mac') return '下载 macOS 版'
  if (os === 'win') return '下载 Windows 版'
  return '下载桌面端'
}
