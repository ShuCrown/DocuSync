import { LINKS, detectOS, downloadLabel } from '../config'
import { IconArrowUpRight, IconDownload, IconGithub } from './icons'
import AppWindow from './AppWindow'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'

const BADGES = ['无需账号', '无需插件', '开源免费']

export default function Hero() {
  const dlLabel = downloadLabel(detectOS())

  return (
    <section id="top" className="pt-32 md:pt-40">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <p className="animate-rise font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">
          open source · mit · free
        </p>

        <h1
          className="animate-rise mt-5 font-serif text-6xl font-black leading-[1.05] tracking-tight md:text-8xl"
          style={{ animationDelay: '0.08s' }}
        >
          DocuSync<span className="text-accent">.</span>
        </h1>

        <p
          className="animate-rise mt-6 max-w-2xl font-serif text-xl leading-relaxed text-ink-soft md:text-2xl"
          style={{ animationDelay: '0.16s' }}
        >
          一站式文档预览 —— 多标签、分栏对比，
          <br className="hidden md:block" />
          PDF / Word / Excel / PPT / Markdown 尽在一处。
        </p>

        <div
          className="animate-rise mt-8 flex flex-wrap gap-2"
          style={{ animationDelay: '0.24s' }}
        >
          {BADGES.map((badge) => (
            <span
              key={badge}
              className="rounded-full border border-ink/15 bg-card px-3.5 py-1.5 font-mono text-xs text-ink-soft"
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
              {badge}
            </span>
          ))}
        </div>

        <div
          className="animate-rise mt-10 flex flex-wrap items-center gap-3"
          style={{ animationDelay: '0.32s' }}
        >
          <a
            href={LINKS.releases}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-bright"
          >
            <IconDownload className="h-[18px] w-[18px]" />
            {dlLabel}
          </a>
          <a
            href={LINKS.webApp}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-ink/20 bg-card px-6 py-3 text-[15px] font-medium text-ink transition hover:-translate-y-0.5 hover:border-ink/50"
          >
            打开 Web 版
            <IconArrowUpRight className="h-4 w-4 text-ink-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" />
          </a>
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库"
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-ink/20 text-ink-soft transition hover:-translate-y-0.5 hover:border-ink/50 hover:text-ink"
          >
            <IconGithub className="h-5 w-5" />
          </a>
        </div>

        <p
          className="animate-rise mt-4 font-mono text-xs leading-6 text-ink-faint"
          style={{ animationDelay: '0.4s' }}
        >
          macOS (Apple Silicon) · Windows x64 —— 每次发版自动构建
        </p>
      </div>

      {/* 00 · 眼见为实 */}
      <div className="mx-auto mt-16 max-w-6xl px-5 pb-24 md:mt-24 md:px-8">
        <Reveal>
          <SectionHeading
            index="00"
            label="眼见为实"
            title="它实际的样子。"
            sub="上传即预览 —— 多标签、分栏、缩放，全部开箱即用。"
          />
        </Reveal>
        <Reveal className="relative mt-10" delay={120}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-6 -z-10 h-96 rounded-full bg-[radial-gradient(closest-side,rgba(28,55,93,0.16),transparent)] blur-2xl"
          />
          <AppWindow />
          <p className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-xs text-ink-faint">
            <span>分栏 <span className="kbd">⌘D</span></span>
            <span aria-hidden="true">·</span>
            <span>交换 <span className="kbd">⇧⌘X</span></span>
            <span aria-hidden="true">·</span>
            <span>标签 <span className="kbd">⌘1–9</span></span>
            <span aria-hidden="true">·</span>
            <span>缩放 <span className="kbd">⌘ +/−</span></span>
          </p>
        </Reveal>
      </div>
    </section>
  )
}
