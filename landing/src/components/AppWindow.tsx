import {
  IconColumns,
  IconFileSpreadsheet,
  IconFileText,
  IconFileType,
  IconPlus,
  IconRows,
  IconShare,
  IconSquareX,
} from './icons'

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

/** 文档纸页 —— 暖纸画布上的白纸，衬线骨架 + 墨蓝批注 */
function DocumentPage() {
  return (
    <div className="flex h-full items-start justify-center overflow-hidden bg-paper-deep/70 px-6 py-6">
      <div className="w-full max-w-[300px] rounded-sm bg-card p-5 shadow-[0_1px_3px_rgba(20,20,19,0.10),0_12px_32px_-12px_rgba(20,20,19,0.25)]">
        <p className="font-mono text-[9px] text-ink-faint">第 3 页 · 共 14 页</p>
        <div className="mt-3 h-3.5 w-1/2 rounded-full bg-ink/70" />
        <div className="mt-4 space-y-2">
          <div className="sk h-1.5 w-full" />
          <div className="sk h-1.5 w-11/12" />
          <div className="rounded border-l-2 border-accent bg-accent/8 px-2.5 py-1.5">
            <div className="sk h-1.5 w-9/12" />
          </div>
          <div className="sk h-1.5 w-full" />
          <div className="sk h-1.5 w-2/3" />
        </div>
        <div className="mt-4 border-y border-ink/10 py-2.5">
          <div className="flex h-9 items-end gap-2 px-1">
            <span className="w-2.5 rounded-t-sm bg-accent/25" style={{ height: '40%' }} />
            <span className="w-2.5 rounded-t-sm bg-accent/45" style={{ height: '70%' }} />
            <span className="w-2.5 rounded-t-sm bg-accent/35" style={{ height: '55%' }} />
            <span className="w-2.5 rounded-t-sm bg-accent/60" style={{ height: '90%' }} />
          </div>
          <div className="mt-2 h-px bg-ink/10" />
          <div className="mt-2 flex justify-between">
            <span className="sk h-1.5 w-10" />
            <span className="sk h-1.5 w-10" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="sk h-1.5 w-full" />
          <div className="sk h-1.5 w-5/12" />
        </div>
      </div>
    </div>
  )
}

/** 应用主窗口 mockup —— 纸面风格：多标签 + 工具栏 + 文档预览 */
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

      {/* 标签栏 —— 类型图标 + 文件名 + 关闭 ×，右侧与应用一致的五件工具 */}
      <div className="flex items-stretch border-b border-ink/10 bg-paper-deep/60">
        <div className="flex min-w-0 flex-1 items-stretch">
          <Tab name="合同-v3.pdf" color="pdf" active />
          <Tab name="报价单.docx" color="word" />
          <Tab name="预算表.xlsx" color="excel" />
        </div>
        <span className="flex items-center gap-1 border-l border-ink/10 px-2.5 text-ink-faint">
          <IconShare className="h-3.5 w-3.5" />
          <IconColumns className="h-3.5 w-3.5" />
          <IconRows className="h-3.5 w-3.5" />
          <IconPlus className="h-3.5 w-3.5" />
          <IconSquareX className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* 文档区 */}
      <div className="h-[360px] md:h-[420px]">
        <DocumentPage />
      </div>
    </div>
  )
}
