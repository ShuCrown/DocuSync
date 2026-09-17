import type { ReactNode } from 'react'
import { IconPlus } from './icons'

const DOT: Record<string, string> = {
  pdf: 'bg-pdf',
  word: 'bg-word',
  excel: 'bg-excel',
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-ink/10 bg-paper px-2 py-0.5 font-mono text-[10px] text-ink-faint">
      {children}
    </span>
  )
}

function Tab({
  name,
  color,
  active = false,
}: {
  name: string
  color: keyof typeof DOT
  active?: boolean
}) {
  return (
    <span
      className={`flex items-center gap-2 rounded-t-lg border border-b-0 px-3.5 py-1.5 text-[13px] ${
        active
          ? 'border-ink/10 bg-card font-medium text-ink'
          : 'border-transparent text-ink-faint'
      }`}
    >
      <span className={`h-2 w-2 rounded-[3px] ${DOT[color]}`} />
      {name}
    </span>
  )
}

/** PDF 分栏：页面骨架 + 迷你图表 + 页码 */
function PdfPane() {
  return (
    <div className="h-full overflow-hidden bg-paper-deep/40 p-4 md:p-5">
      <div className="mx-auto max-w-[300px] space-y-3">
        <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm">
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
        <div className="rounded-lg border border-ink/10 bg-white p-4 opacity-50">
          <div className="sk h-1.5 w-1/2" />
          <div className="sk mt-2 h-1.5 w-full" />
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-[10px] text-ink-faint">‹ 3 / 14 ›</p>
    </div>
  )
}

/** Excel 分栏：Sheet 标签 + 品牌色表头网格 */
const SHEET_ROWS: Array<[string, string, string, string, 'up' | 'down' | 'flat']> = [
  ['服务器', '1.2k', '1.4k', '+16%', 'up'],
  ['推广', '8.7k', '6.3k', '-27%', 'down'],
  ['人力', '21k', '24k', '+14%', 'up'],
  ['办公', '0.9k', '0.9k', '0%', 'flat'],
  ['合计', '31.8k', '34.6k', '+8%', 'up'],
]

function ExcelPane() {
  return (
    <div className="flex h-full flex-col border-l border-ink/10 bg-paper-deep/40">
      <div className="flex items-end gap-0.5 border-b border-ink/10 px-3 pt-2.5 text-[11px]">
        <span className="-mb-px rounded-t-md border border-b-0 border-ink/10 bg-white px-3 py-1 font-medium text-excel">
          Q4 预算
        </span>
        <span className="px-3 py-1 text-ink-faint">汇总</span>
        <span className="px-3 py-1 text-ink-faint">Sheet3</span>
        <span className="ml-auto pb-1 font-mono text-[10px] text-ink-faint/70">+</span>
      </div>
      <div className="grid grid-cols-4 gap-px bg-ink/10 p-px font-mono text-[10px]">
        {['项目', 'Q3', 'Q4', 'Δ'].map((h) => (
          <div key={h} className="bg-excel/10 px-2 py-1.5 font-medium text-excel">
            {h}
          </div>
        ))}
        {SHEET_ROWS.map((row) => (
          <div key={row[0]} className="contents">
            <div className="bg-white px-2 py-1.5 text-ink-soft">{row[0]}</div>
            <div className="bg-white px-2 py-1.5 text-ink-faint">{row[1]}</div>
            <div className="bg-white px-2 py-1.5 text-ink-soft">{row[2]}</div>
            <div
              className={`bg-white px-2 py-1.5 ${
                row[4] === 'up'
                  ? 'text-excel'
                  : row[4] === 'down'
                    ? 'text-pdf'
                    : 'text-ink-faint'
              }`}
            >
              {row[3]}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 应用主窗口 mockup —— 纯 CSS 还原多标签 + 分栏界面 */
export default function AppWindow() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/15 bg-card shadow-window md:rounded-2xl">
      {/* 标题栏 */}
      <div className="flex items-center gap-3 border-b border-ink/8 bg-paper-deep/60 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="mx-auto pr-12 font-mono text-xs text-ink-faint">DocuSync</span>
        <span className="font-mono text-[10px] text-ink-faint/70">v0.0.34</span>
      </div>

      {/* 标签栏 */}
      <div className="flex items-end gap-1 border-b border-ink/10 bg-paper/70 px-2 pt-2">
        <Tab name="合同-v3.pdf" color="pdf" active />
        <Tab name="报价单.docx" color="word" />
        <Tab name="预算表.xlsx" color="excel" />
        <span className="mx-1 mb-2 flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition hover:bg-ink/5 hover:text-ink">
          <IconPlus className="h-3.5 w-3.5" />
        </span>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b border-ink/8 bg-card px-3 py-1.5">
        <Chip>交换 ⇧⌘X</Chip>
        <Chip>方向 ⌥⌘D</Chip>
        <span className="ml-auto">
          <Chip>50%</Chip>
        </span>
      </div>

      {/* 分栏内容 */}
      <div className="flex h-[360px] md:h-[420px]">
        <div className="min-w-0 flex-1">
          <PdfPane />
        </div>
        <div className="min-w-0 flex-1">
          <ExcelPane />
        </div>
      </div>
    </div>
  )
}
