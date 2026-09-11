import { useRef, useState } from 'react'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { IconSwap } from './icons'

const clamp = (v: number) => Math.min(78, Math.max(22, v))

const HINTS: Array<{ keys: string; title: string; desc: string }> = [
  { keys: '⌘D', title: '新建分栏', desc: '左右 / 上下，随时再分' },
  { keys: '⇧⌘X', title: '交换两侧', desc: '一键对调两份文档' },
  { keys: '⌥⌘D', title: '切换方向', desc: '水平 ↔ 垂直' },
  { keys: '⌘ +/−', title: '独立缩放', desc: '每个分栏各自滚动、缩放' },
]

const MASK = {
  maskImage: 'linear-gradient(to bottom, black 76%, transparent 98%)',
  WebkitMaskImage: 'linear-gradient(to bottom, black 76%, transparent 98%)',
} as const

/** 左侧文档：旧版本 */
function PaneV2() {
  return (
    <div className="h-full overflow-hidden bg-card p-4 md:p-5" style={MASK}>
      <p className="font-mono text-[10px] text-ink-faint">v2 · 11 月版</p>
      <div className="mt-4 space-y-2.5">
        <div className="sk h-3 w-24" />
        <div className="sk h-1.5 w-full" />
        <div className="sk h-1.5 w-10/12" />
        <div className="sk h-1.5 w-8/12" />
        <div className="sk mt-5 h-3 w-16" />
        <div className="sk h-1.5 w-full" />
        <div className="sk h-1.5 w-9/12" />
        <div className="sk h-1.5 w-11/12" />
        <div className="sk h-1.5 w-6/12" />
      </div>
    </div>
  )
}

/** 右侧文档：新版 v3，被高亮的「三、交付周期」段落 */
function PaneV3() {
  return (
    <div className="h-full overflow-hidden bg-card p-4 md:p-5" style={MASK}>
      <p className="font-mono text-[10px] text-accent">v3 · 本周更新</p>
      <div className="mt-4 space-y-2.5">
        <div className="sk h-3 w-24" />
        <div className="sk h-1.5 w-full" />
        <div className="sk h-1.5 w-10/12" />
        <div className="rounded-md border-l-2 border-accent bg-accent/10 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink">三、交付周期</span>
            <span className="rounded-sm bg-accent px-1.5 py-px font-mono text-[9px] text-white">
              已更新
            </span>
          </div>
          <div className="sk mt-2.5 h-1.5 w-full" />
          <div className="sk mt-1.5 h-1.5 w-7/12" />
        </div>
        <div className="sk h-1.5 w-full" />
        <div className="sk h-1.5 w-9/12" />
        <div className="sk h-1.5 w-6/12" />
      </div>
    </div>
  )
}

/** 02 · 分栏对比：可拖拽分隔条 + 交换两侧的交互 demo */
function SplitDemo() {
  const [ratio, setRatio] = useState(56)
  const [swapped, setSwapped] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const apply = (clientX: number) => {
    const el = track.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setRatio(clamp(((clientX - rect.left) / rect.width) * 100))
  }

  const left = swapped ? <PaneV3 /> : <PaneV2 />
  const right = swapped ? <PaneV2 /> : <PaneV3 />
  const leftName = swapped ? '合同-v3.pdf' : '合同-v2.pdf'
  const rightName = swapped ? '合同-v2.pdf' : '合同-v3.pdf'

  return (
    <div className="select-none">
      <div className="flex items-center justify-between gap-2 border-b border-paper/10 bg-night-edge/80 px-3 py-2 font-mono text-[11px] text-paper/60">
        <span className="truncate">{leftName} · {Math.round(100 - ratio)}%</span>
        <button
          type="button"
          onClick={() => setSwapped((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-paper/25 px-2.5 py-1 transition hover:bg-paper/10 hover:text-paper"
        >
          <IconSwap className="h-3.5 w-3.5" />
          交换 ⇧⌘X
        </button>
        <span className="truncate">{rightName} · {Math.round(ratio)}%</span>
      </div>

      <div ref={track} className="flex h-[280px] md:h-[320px]">
        <div className="min-w-0 overflow-hidden" style={{ width: `${100 - ratio}%` }}>
          {left}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整分栏比例"
          aria-valuenow={Math.round(ratio)}
          tabIndex={0}
          className="group relative w-2 shrink-0 cursor-col-resize touch-none bg-paper/15 outline-none transition-colors hover:bg-accent-bright focus-visible:bg-accent-bright"
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            e.preventDefault()
          }}
          onPointerMove={(e) => {
            if (dragging.current) apply(e.clientX)
          }}
          onPointerUp={() => {
            dragging.current = false
          }}
          onPointerCancel={() => {
            dragging.current = false
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setRatio((r) => clamp(r - 4))
            if (e.key === 'ArrowRight') setRatio((r) => clamp(r + 4))
          }}
        >
          <span className="absolute inset-y-0 left-1/2 flex h-full w-4 -translate-x-1/2 items-center justify-center">
            <span className="h-8 w-0.5 rounded-full bg-paper/40 transition group-hover:bg-white" />
          </span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          {right}
        </div>
      </div>

      <p className="mt-4 text-center font-mono text-[11px] text-paper/50">
        ↑ 试一试：拖动中间的分隔条，或点「交换」—— 真实应用里同样顺滑
      </p>
    </div>
  )
}

export default function SplitSection() {
  return (
    <section id="split" className="bg-night py-24 text-paper md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <Reveal>
          <SectionHeading
            dark
            index="02"
            label="分栏对比"
            title="并排阅读，本来就该这么简单。"
            sub="左右 / 上下分栏，拖动分隔条调整比例；每个分栏独立滚动与缩放，切换标签时文档状态完整保留。"
          />
        </Reveal>

        <div className="mt-12 gap-10 lg:grid lg:grid-cols-5">
          <Reveal className="lg:col-span-2">
            <ul className="space-y-6">
              {HINTS.map((hint) => (
                <li key={hint.keys} className="flex items-start gap-4">
                  <span className="kbd shrink-0 !border-paper/25 !bg-transparent !text-paper/80">
                    {hint.keys}
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-paper">{hint.title}</p>
                    <p className="mt-0.5 text-sm text-paper/60">{hint.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal className="lg:col-span-3" delay={120}>
            <div className="overflow-hidden rounded-xl border border-paper/20 shadow-2xl">
              <SplitDemo />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
