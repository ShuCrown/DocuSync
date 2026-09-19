import { LINKS } from '../config'
import { IconGithub } from './icons'

export default function Footer() {
  return (
    <footer className="border-t border-ink/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between md:px-8">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-serif font-bold tracking-tight">DocuSync</span>
          <span className="text-ink-faint">本地优先的一站式文档预览 · © 2026</span>
        </p>

        <nav className="flex items-center gap-6 text-ink-soft">
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition hover:text-ink"
          >
            <IconGithub className="h-4 w-4" />
            GitHub
          </a>
          <a href={LINKS.releases} target="_blank" rel="noreferrer" className="transition hover:text-ink">
            更新日志
          </a>
          <a href={LINKS.webApp} target="_blank" rel="noreferrer" className="transition hover:text-ink">
            Web 版
          </a>
        </nav>
      </div>
    </footer>
  )
}
