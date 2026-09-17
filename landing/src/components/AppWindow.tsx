import { IconFileSpreadsheet, IconFileText, IconFileType, IconPlus } from './icons'

/** 与应用内 fileIcon.tsx 一致的类型色 */
const FILE_ICON: Record<string, { Icon: typeof IconFileText; color: string }> = {
  pdf: { Icon: IconFileText, color: '#b53333' },
  word: { Icon: IconFileType, color: '#2d5a8a' },
  excel: { Icon: IconFileSpreadsheet, color: '#3a7d5c' },
}

function Tab({
  name,
  color,
  active = false,
}: {
  name: string
  color: keyof typeof FILE_ICON
  active?: boolean
}) {
  const { Icon, color: iconColor } = FILE_ICON[color]
  return (
    <span
      className={`flex items-center gap-1.5 border-r border-ink/10 py-1.5 pl-2.5 pr-1.5 text-xs font-medium ${
        active ? 'bg-card text-ink' : 'bg-paper-deep/40 text-ink-soft'
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" style={{ color: iconColor }} />
      <span className="max-w-[140px] truncate">{name}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`h-2.5 w-2.5 shrink-0 ${active ? 'text-ink-faint' : 'text-transparent'}`}
        aria-hidden="true"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </span>
  )
}

/** 文档区 —— 深灰画布 + 居中纸页，与应用内 PDF 查看器一致 */
function PdfPage() {
  return (
    <div className="flex h-full flex-col items-center gap-2 overflow-hidden bg-[#504e49] py-4">
      <div className="w-[240px] shrink-0 rounded-sm bg-white p-4 shadow-md">
        <div className="sk h-3 w-2/5" />
        <div className="sk mt-3 h-1.5 w-full" />
        <div className="sk mt-1.5 h-1.5 w-11/12" />
        <div className="sk mt-1.5 h-1.5 w-4/5" />
        <div className="mt-3 flex h-16 items-center justify-center rounded border border-ink/8 bg-paper">
          <div className="flex h-11 items-end gap-1.5">
            <span className="h-5 w-2.5 bg-pdf/25" />
            <span className="h-9 w-2.5 bg-pdf/40" />
            <span className="h-7 w-2.5 bg-pdf/30" />
            <span className="h-11 w-2.5 bg-pdf/45" />
          </div>
        </div>
        <div className="sk mt-3 h-1.5 w-full" />
        <div className="sk mt-1.5 h-1.5 w-2/3" />
      </div>
      <div className="w-[240px] shrink-0 rounded-sm bg-white p-4 opacity-50 shadow-md">
        <div className="sk h-1.5 w-1/2" />
        <div className="sk mt-2 h-1.5 w-full" />
      </div>
      <p className="mt-auto font-mono text-[10px] text-white/50">‹ 3 / 14 ›</p>
    </div>
  )
}

/** 应用主窗口 mockup —— 纯 CSS 还原多标签 + 文档预览界面 */
export default function AppWindow() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/15 bg-card shadow-window md:rounded-2xl">
      {/* 标题栏 */}
      <div className="relative flex items-center border-b border-ink/8 bg-paper-deep/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="pointer-events-none absolute inset-x-0 text-center font-mono text-xs text-ink-faint">
          DocuSync
        </span>
      </div>

      {/* 标签栏 —— VSCode 式：类型图标 + 文件名 + 关闭 ×，右侧新建 */}
      <div className="flex items-stretch border-b border-ink/10 bg-paper-deep/60">
        <div className="flex min-w-0 flex-1 items-stretch">
          <Tab name="合同-v3.pdf" color="pdf" active />
          <Tab name="报价单.docx" color="word" />
          <Tab name="预算表.xlsx" color="excel" />
        </div>
        <span className="flex items-center px-2 text-ink-faint">
          <IconPlus className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* 文档区 */}
      <div className="h-[360px] md:h-[420px]">
        <PdfPage />
      </div>
    </div>
  )
}
