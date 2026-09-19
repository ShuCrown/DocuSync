import { Logo } from './icons'

const NAV_LINKS = [
  { href: '#formats', label: '特性' },
  { href: '#split', label: '分栏对比' },
  { href: '#start', label: '开始使用' },
]

export default function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-ink/10 bg-paper/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-5 md:gap-10 md:px-8">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
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

      </div>
    </header>
  )
}
