import { LINKS, detectOS, downloadLabel } from '../config'
import { IconGithub, Logo } from './icons'

const NAV_LINKS = [
  { href: '#formats', label: '特性' },
  { href: '#split', label: '分栏对比' },
  { href: '#start', label: '下载' },
]

export default function Nav() {
  const label = downloadLabel(detectOS())

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-ink/10 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 md:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo className="h-6 w-6 text-accent" />
          <span className="font-serif text-lg font-bold tracking-tight">DocuSync</span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-ink-soft md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="transition hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={LINKS.repo}
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub 仓库"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 text-ink-soft transition hover:border-ink/40 hover:text-ink"
          >
            <IconGithub className="h-[18px] w-[18px]" />
          </a>
          <a
            href={LINKS.releases}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-accent"
          >
            {label}
          </a>
        </div>
      </div>
    </header>
  )
}
