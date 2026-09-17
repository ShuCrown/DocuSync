import { LINKS } from '../config'
import { IconArrowUpRight } from './icons'
import AppWindow from './AppWindow'
import Reveal from './Reveal'

export default function Hero() {
  return (
    <section id="top" className="pt-32 md:pt-40">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <h1
          className="animate-rise font-serif text-6xl font-black leading-[1.05] tracking-tight md:text-8xl"
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
          className="animate-rise mt-10 flex flex-wrap items-center gap-3"
          style={{ animationDelay: '0.32s' }}
        >
          <a
            href={LINKS.webApp}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-lg shadow-accent/25 transition hover:-translate-y-0.5 hover:bg-accent-bright"
          >
            打开 Web 版
            <IconArrowUpRight className="h-4 w-4 text-white/80 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      {/* 应用窗口即主视觉 */}
      <div className="mx-auto mt-16 max-w-6xl px-5 pb-24 md:mt-20 md:px-8">
        <Reveal className="relative" delay={120}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-8 top-6 -z-10 h-96 rounded-full bg-[radial-gradient(closest-side,rgba(28,55,93,0.16),transparent)] blur-2xl"
          />
          <AppWindow />
        </Reveal>
      </div>
    </section>
  )
}
