import type { ReactNode } from 'react'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'

const SPECS: Array<[string, string]> = [
  ['pdf.js', 'PDF 全文渲染 · 页面导航 · 缩放'],
  ['mammoth', 'Word → HTML · 保留目录结构'],
  ['SheetJS', 'Excel 解析 · Sheet 标签切换'],
  ['DOMPurify', 'Office HTML 消毒 · 防 XSS'],
  ['react-markdown', 'GFM 表格 · 代码语法高亮'],
]

function FileCard({
  tone,
  ext,
  name,
  meta,
  children,
}: {
  tone: string
  ext: string
  name: string
  meta: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-ink/15 bg-card p-4 transition duration-300 hover:-translate-y-1 hover:border-ink/60 hover:shadow-[6px_6px_0_0_#242933]">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide text-white ${tone}`}
        >
          {ext}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{name}</p>
          <p className="font-mono text-[10px] text-ink-faint">{meta}</p>
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** 01 · 多格式预览：每种格式一张「迷你文档」卡片 */
export default function Formats() {
  return (
    <section id="formats" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <SectionHeading
            index="01"
            label="多格式预览"
            title="每一种格式，都被认真对待。"
            sub="不套同一个壳：每种格式走自己的渲染管线，配自己的图标与品牌色，混在一排标签页里也一眼可辨。"
          />
        </Reveal>

        <div className="mt-12 gap-10 lg:grid lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <div className="lg:sticky lg:top-28">
              <p className="text-[15px] leading-8 text-ink-soft">
                拖进来就开始读，不用先想「这文件该用什么打开」。
                PDF 逐页渲染、Word 保留目录、Excel 展开 Sheet 标签、
                PPT 逐张幻灯片、Markdown 带语法高亮 ——
                五种格式，同一个窗口。
              </p>
              <dl className="mt-8 space-y-2.5 font-mono text-xs">
                {SPECS.map(([lib, desc]) => (
                  <div key={lib} className="flex items-baseline gap-3">
                    <dt className="w-28 shrink-0 text-ink-faint">{lib}</dt>
                    <dd className="text-ink-soft">{desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:col-span-3 lg:mt-0">
            <Reveal delay={0}>
              <FileCard tone="bg-pdf" ext="PDF" name="项目合同-v3.pdf" meta="全文渲染 · 14 页">
                <div className="rounded-lg border border-ink/10 bg-white p-3">
                  <div className="sk h-2 w-1/3" />
                  <div className="sk mt-2.5 h-1.5 w-full" />
                  <div className="sk mt-1.5 h-1.5 w-10/12" />
                  <div className="sk mt-1.5 h-1.5 w-3/5" />
                  <div className="mt-3 flex items-center justify-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-ink/20" />
                    <span className="h-1 w-1 rounded-full bg-pdf/60" />
                    <span className="h-1 w-1 rounded-full bg-ink/20" />
                  </div>
                </div>
              </FileCard>
            </Reveal>

            <Reveal delay={60}>
              <FileCard tone="bg-word" ext="DOC" name="产品需求文档.docx" meta="HTML 转换 · 带目录">
                <div className="flex gap-2.5 rounded-lg border border-ink/10 bg-white p-3">
                  <div className="w-10 shrink-0 space-y-1.5 border-r border-ink/8 pr-2.5">
                    <div className="sk h-1.5 w-6" />
                    <div className="sk h-1.5 w-8" />
                    <div className="sk h-1.5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="sk h-2 w-2/5" />
                    <div className="sk mt-2 h-1.5 w-full" />
                    <div className="sk mt-1.5 h-1.5 w-11/12" />
                    <div className="sk mt-1.5 h-1.5 w-4/6" />
                  </div>
                </div>
              </FileCard>
            </Reveal>

            <Reveal delay={120}>
              <FileCard tone="bg-excel" ext="XLS" name="季度预算.xlsx" meta="表格解析 · 3 Sheets">
                <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-ink/10 bg-ink/10 p-px font-mono text-[9px]">
                  {['月份', '预算', '实际'].map((h) => (
                    <div key={h} className="bg-excel/10 px-2 py-1.5 font-medium text-excel">
                      {h}
                    </div>
                  ))}
                  {['10 月', '¥12k', '¥11k'].map((c) => (
                    <div key={c} className="bg-white px-2 py-1.5 text-ink-faint">
                      {c}
                    </div>
                  ))}
                  {['11 月', '¥12k', '¥13k'].map((c) => (
                    <div key={c} className="bg-white px-2 py-1.5 text-ink-faint">
                      {c}
                    </div>
                  ))}
                </div>
              </FileCard>
            </Reveal>

            <Reveal delay={180}>
              <FileCard tone="bg-ppt" ext="PPT" name="路演汇报.pptx" meta="幻灯片 · 36 页">
                <div className="flex items-center gap-3 rounded-lg border border-ink/10 bg-white p-3">
                  <div className="flex h-12 w-16 shrink-0 flex-col justify-end gap-1 rounded-md border border-ink/10 p-2">
                    <div className="sk h-1.5 w-2/3" />
                    <span className="h-3 w-8 rounded-sm bg-ppt/50" />
                  </div>
                  <div className="flex h-8 flex-1 items-end gap-1">
                    <span className="h-3 w-3 bg-ppt/30" />
                    <span className="h-5 w-3 bg-ppt/45" />
                    <span className="h-8 w-3 bg-ppt/60" />
                  </div>
                </div>
              </FileCard>
            </Reveal>

            <Reveal delay={240} className="sm:col-span-2">
              <FileCard tone="bg-ink" ext="MD" name="开发笔记.md" meta="GFM · 语法高亮">
                <div className="rounded-lg border border-ink/10 bg-white p-3 font-mono text-[10px] leading-6">
                  <p className="font-bold text-ink">## 发布前检查</p>
                  <p>
                    <span className="text-accent">- [x]</span> 压缩产物
                  </p>
                  <p>
                    <span className="text-accent">- [ ]</span> 补一条更新日志
                  </p>
                  <p className="text-excel">npm run deploy</p>
                </div>
              </FileCard>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
