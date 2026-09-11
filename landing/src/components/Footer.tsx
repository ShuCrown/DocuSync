import { LINKS } from '../config'
import { Logo } from './icons'

export default function Footer() {
  return (
    <footer className="border-t border-ink/10 py-10">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 px-5 md:flex-row md:items-center md:px-8">
        <div className="flex items-center gap-2.5">
          <Logo className="h-5 w-5" />
          <span className="font-serif font-bold text-ink">DocuSync</span>
          <span className="font-mono text-xs text-ink-faint">一站式文档预览</span>
        </div>

        <nav className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-xs text-ink-soft">
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-accent"
          >
            GitHub ↗
          </a>
          <a
            href={LINKS.releases}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-accent"
          >
            Releases ↗
          </a>
          <a
            href={LINKS.webApp}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-accent"
          >
            Web 版 ↗
          </a>
          <span className="text-ink-faint">MIT License</span>
        </nav>
      </div>
      <p className="mt-8 text-center font-mono text-[11px] text-ink-faint/70">
        Built with React · Tauri · Cloudflare
      </p>
    </footer>
  )
}
