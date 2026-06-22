import { FileText, ExternalLink } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold text-text">DocuSync</span>
          </div>
          <nav className="flex items-center gap-4">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-text transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-center text-sm text-text-secondary">
          DocuSync — 文档预览与智能摘要
        </div>
      </footer>
    </div>
  )
}
