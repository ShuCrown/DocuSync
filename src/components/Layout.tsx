import { FileText, ExternalLink, ArrowLeft, Clock, Sparkles, Loader2, X, User } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { getCategoryLabel } from '../utils/fileType'
import { formatTime } from '../utils/formatTime'
import type { FileRecord } from '../hooks/useFileHistory'

interface LayoutProps {
  children: React.ReactNode
  currentFileName?: string | null
  onBack?: () => void
  history?: FileRecord[]
  onHistorySelect?: (record: FileRecord) => void
  onHistoryRemove?: (id: string) => void
  onHistoryClear?: () => void
  onSummaryToggle?: () => void
  summaryLoading?: boolean
  hasSummary?: boolean
  email?: string | null
  onAccountOpen?: () => void
}

export function Layout({
  children,
  currentFileName,
  onBack,
  history = [],
  onHistorySelect,
  onHistoryRemove,
  onHistoryClear,
  onSummaryToggle,
  summaryLoading,
  hasSummary,
  email,
  onAccountOpen,
}: LayoutProps) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)

  // Close history dropdown on click outside
  useEffect(() => {
    if (!historyOpen) return
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [historyOpen])

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-surface-card/80 backdrop-blur-sm relative z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: back + file name or logo */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {currentFileName ? (
              <>
                <button
                  onClick={onBack}
                  className="p-1.5 rounded-md hover:bg-surface-alt transition-colors text-text-secondary hover:text-text shrink-0"
                  title="返回上传页"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>
                <FileText className="w-4.5 h-4.5 text-primary shrink-0" />
                <span className="text-sm font-medium text-text truncate">
                  {currentFileName}
                </span>
              </>
            ) : (
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-lg font-medium text-text tracking-tight">DocuSync</span>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* AI Summary button (only when file is open) */}
            {currentFileName && onSummaryToggle && (
              <button
                onClick={onSummaryToggle}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
              >
                {summaryLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">AI 摘要</span>
                {hasSummary && !summaryLoading && (
                  <span className="w-1.5 h-1.5 bg-green-300 rounded-full" />
                )}
              </button>
            )}

            {/* History dropdown */}
            {history.length > 0 && (
              <div className="relative" ref={historyRef}>
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className={`
                    p-2 rounded-md transition-colors
                    ${historyOpen
                      ? 'bg-surface-alt text-text'
                      : 'text-text-secondary hover:text-text hover:bg-surface-alt/60'
                    }
                  `}
                  title="历史记录"
                >
                  <Clock className="w-4.5 h-4.5" />
                </button>

                {historyOpen && (
                  <div className="absolute right-0 top-full mt-1 w-80 max-h-[60vh] bg-surface-card border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col">
                    {/* Dropdown header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-alt/40">
                      <span className="text-xs font-medium text-text-secondary">最近查看</span>
                      {onHistoryClear && (
                        <button
                          onClick={() => { onHistoryClear(); setHistoryOpen(false) }}
                          className="text-[11px] text-text-secondary hover:text-error transition-colors"
                        >
                          清空
                        </button>
                      )}
                    </div>

                    {/* History list */}
                    <div className="overflow-y-auto divide-y divide-border">
                      {history.map((record) => (
                        <div
                          key={record.id}
                          className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-alt/50 transition-colors group"
                        >
                          <button
                            onClick={() => {
                              onHistorySelect?.(record)
                              setHistoryOpen(false)
                            }}
                            className="flex-1 min-w-0 text-left"
                          >
                            <p className="text-sm text-text truncate">{record.name}</p>
                            <p className="text-[11px] text-text-secondary mt-0.5">
                              <span className="inline-block px-1 py-0.5 bg-surface-alt rounded text-[10px] mr-1">
                                {getCategoryLabel(record.category)}
                              </span>
                              {formatTime(record.timestamp)}
                            </p>
                          </button>
                          {onHistoryRemove && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                onHistoryRemove(record.id)
                              }}
                              className="p-0.5 rounded text-text-secondary/40 hover:text-error opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Account button */}
            {onAccountOpen && (
              <button
                onClick={onAccountOpen}
                className={`p-2 rounded-md transition-colors ${
                  email
                    ? 'text-primary hover:bg-primary/10'
                    : 'text-text-secondary hover:text-text hover:bg-surface-alt/60'
                }`}
                title={email ? `已绑定: ${email}` : '账户管理'}
              >
                <User className="w-4.5 h-4.5" />
              </button>
            )}

            {/* GitHub link */}
            <a
              href="https://github.com/anthropics/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt/60 transition-colors"
              title="GitHub"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface-card/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-center text-sm text-text-secondary tracking-wide">
          DocuSync — 文档预览与智能摘要
        </div>
      </footer>
    </div>
  )
}
