import { useState } from 'react'
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

type DocKind = 'pdf' | 'word' | 'excel'

/** 与应用内 fileIcon.tsx 一致的类型色 */
const FILE_ICON: Record<DocKind, { Icon: typeof IconFileText; color: string }> = {
  pdf: { Icon: IconFileText, color: '#b53333' },
  word: { Icon: IconFileType, color: '#2d5a8a' },
  excel: { Icon: IconFileSpreadsheet, color: '#3a7d5c' },
}

const TABS: { kind: DocKind; name: string; className?: string }[] = [
  { kind: 'pdf', name: '合同-v3.pdf' },
  { kind: 'word', name: '报价单.docx' },
  { kind: 'excel', name: '预算表.xlsx', className: 'hidden min-[420px]:flex' },
]

function Tab({
  name,
  kind,
  active,
  onSelect,
  className = '',
}: {
  name: string
  kind: DocKind
  active: boolean
  onSelect: () => void
  className?: string
}) {
  const { Icon, color } = FILE_ICON[kind]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex cursor-pointer items-center gap-1.5 border-r border-ink/10 py-1.5 pl-2.5 pr-1.5 text-xs font-medium transition-colors ${className} ${
        active ? 'bg-card text-ink' : 'bg-paper-deep/40 text-ink-soft hover:bg-card/70 hover:text-ink'
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" style={{ color }} />
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
    </button>
  )
}

/** PDF 纸页 —— 暖纸画布上的白纸，衬线骨架 + 墨蓝批注 */
function PdfPage() {
  return (
    <div className="flex h-full items-start justify-center overflow-hidden bg-paper-deep/70 px-5 py-6 md:px-8">
      <div className="w-full max-w-[560px] rounded-sm bg-card p-6 shadow-[0_1px_3px_rgba(20,20,19,0.10),0_12px_32px_-12px_rgba(20,20,19,0.25)] md:p-8">
        <p className="font-mono text-[10px] text-ink-faint">第 3 页 · 共 14 页</p>
        <div className="mt-3 h-4 w-1/2 rounded-full bg-ink/70" />
        <div className="mt-5 space-y-2.5">
          <div className="sk h-2 w-full" />
          <div className="sk h-2 w-11/12" />
          <div className="rounded border-l-2 border-accent bg-accent/8 px-3 py-2">
            <div className="sk h-2 w-9/12" />
          </div>
          <div className="sk h-2 w-full" />
          <div className="sk h-2 w-2/3" />
        </div>
        <div className="mt-5 border-y border-ink/10 py-3">
          <div className="flex h-12 items-end gap-2.5 px-1">
            <span className="w-3 rounded-t-sm bg-accent/25" style={{ height: '40%' }} />
            <span className="w-3 rounded-t-sm bg-accent/45" style={{ height: '70%' }} />
            <span className="w-3 rounded-t-sm bg-accent/35" style={{ height: '55%' }} />
            <span className="w-3 rounded-t-sm bg-accent/60" style={{ height: '90%' }} />
          </div>
          <div className="mt-2.5 h-px bg-ink/10" />
          <div className="mt-2.5 flex justify-between">
            <span className="sk h-2 w-12" />
            <span className="sk h-2 w-12" />
          </div>
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="sk h-2 w-full" />
          <div className="sk h-2 w-10/12" />
          <div className="sk h-2 w-5/12" />
        </div>
      </div>
    </div>
  )
}

/** Word 分页 —— 整页白纸：大标题、正文段落、边框表格 */
function WordPage() {
  return (
    <div className="flex h-full items-start justify-center overflow-hidden bg-paper-deep/70 px-5 py-6 md:px-8">
      <div className="w-full max-w-[560px] rounded-sm bg-card px-8 py-7 shadow-[0_1px_3px_rgba(20,20,19,0.10),0_12px_32px_-12px_rgba(20,20,19,0.25)] md:px-10">
        <div className="h-5 w-2/3 rounded-full bg-word/80" />
        <div className="mt-3 h-px w-full bg-ink/10" />
        <div className="mt-5 space-y-2.5">
          <div className="sk h-2 w-full" />
          <div className="sk h-2 w-11/12" />
          <div className="sk h-2 w-10/12" />
          <div className="sk h-2 w-4/12" />
        </div>
        <div className="mt-5 h-3 w-1/3 rounded-full bg-ink/60" />
        <div className="mt-3 space-y-2.5">
          <div className="sk h-2 w-full" />
          <div className="sk h-2 w-9/12" />
        </div>
        <div className="mt-5 grid grid-cols-3 overflow-hidden rounded border border-ink/15 text-center">
          {['项目', '单价', '数量'].map((h) => (
            <div key={h} className="border-b border-r border-ink/15 bg-paper-deep/60 px-1 py-1.5 text-[11px] font-medium text-ink-soft last:border-r-0">
              {h}
            </div>
          ))}
          {[0, 1, 2].map((r) => (
            <div key={r} className="contents">
              <div className="border-b border-r border-ink/10 px-1 py-2 last:border-b-0">
                <div className="sk mx-auto h-2 w-10" />
              </div>
              <div className="border-b border-r border-ink/10 px-1 py-2 last:border-b-0">
                <div className="sk mx-auto h-2 w-8" />
              </div>
              <div className="border-b border-ink/10 px-1 py-2 last:border-b-0">
                <div className="sk mx-auto h-2 w-6" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="sk h-2 w-full" />
          <div className="sk h-2 w-7/12" />
        </div>
      </div>
    </div>
  )
}

/** Excel 网格 —— 行号列 + 字母表头 + 数据格 + 底部 sheet 标签 */
function ExcelPage() {
  const cols = ['A', 'B', 'C', 'D', 'E']
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="overflow-hidden rounded border border-ink/12">
          <div className="grid grid-cols-[28px_repeat(5,1fr)] border-b border-ink/12 bg-paper-deep/60">
            <span className="border-r border-ink/12" />
            {cols.map((c) => (
              <span key={c} className="border-r border-ink/12 py-1 text-center font-mono text-[9px] text-ink-faint last:border-r-0">
                {c}
              </span>
            ))}
          </div>
          {Array.from({ length: 13 }, (_, r) => (
            <div key={r} className="grid grid-cols-[28px_repeat(5,1fr)] border-b border-ink/8 last:border-b-0">
              <span className="border-r border-ink/12 bg-paper-deep/60 py-1.5 text-center font-mono text-[8px] text-ink-faint">
                {r + 1}
              </span>
              {cols.map((c, ci) => (
                <span key={c} className="border-r border-ink/8 px-1.5 py-1.5 last:border-r-0">
                  {r === 0 ? (
                    <span
                      className="sk block h-1.5 w-3/4"
                      style={{ background: 'color-mix(in srgb, var(--color-excel) 30%, transparent)' }}
                    />
                  ) : (r + ci) % 3 === 0 ? (
                    <span className="sk block h-1.5 w-1/2" />
                  ) : (r + ci) % 3 === 1 ? (
                    <span className="sk ml-auto block h-1.5 w-2/5" />
                  ) : null}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-ink/10 bg-paper-deep/40 px-2 py-1">
        <span className="rounded-t border border-ink/15 border-b-card bg-card px-2.5 py-0.5 text-[10px] font-medium text-ink">
          Sheet1
        </span>
        <span className="px-2.5 py-0.5 text-[10px] text-ink-faint">汇总</span>
      </div>
    </div>
  )
}

const PANE: Record<DocKind, () => React.JSX.Element> = {
  pdf: PdfPage,
  word: WordPage,
  excel: ExcelPage,
}

/** 应用主窗口 mockup —— 多标签可点击切换预览（PDF / Word / Excel） */
export default function AppWindow() {
  const [active, setActive] = useState<DocKind>('pdf')
  const Pane = PANE[active]

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

      {/* 标签栏 —— 点击切换下方预览 */}
      <div className="flex items-stretch border-b border-ink/10 bg-paper-deep/60">
        <div className="flex min-w-0 flex-1 items-stretch">
          {TABS.map((t) => (
            <Tab
              key={t.kind}
              name={t.name}
              kind={t.kind}
              active={active === t.kind}
              onSelect={() => setActive(t.kind)}
              className={t.className}
            />
          ))}
        </div>
        <span className="flex items-center gap-1 border-l border-ink/10 px-2.5 text-ink-faint">
          <IconShare className="h-3.5 w-3.5" />
          <IconColumns className="h-3.5 w-3.5" />
          <IconRows className="h-3.5 w-3.5" />
          <IconPlus className="h-3.5 w-3.5" />
          <IconSquareX className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* 文档区 —— key 切换触发淡入 */}
      <div className="h-[360px] md:h-[420px]">
        <div key={active} className="pane-in h-full">
          <Pane />
        </div>
      </div>
    </div>
  )
}
