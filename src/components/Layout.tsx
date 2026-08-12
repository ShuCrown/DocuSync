import {
  FileText,
  User,
  Settings,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
interface LayoutProps {
  children: React.ReactNode
  currentFileName?: string | null
  onBack?: () => void
  email?: string | null
  onAccountOpen?: () => void
  onSettingsOpen?: () => void
  // Chat panel split width — shrinks the main panel to make room
  chatSplitWidth?: number
  // Browser-like zoom of the DOCUMENT area only (chat panels zoom via their
  // own per-panel controls).
  docZoom?: number
  onDocZoomIn?: () => void
  onDocZoomOut?: () => void
  onDocZoomReset?: () => void
}

export function Layout({
  children,
  currentFileName,
  onBack,
  email,
  onAccountOpen,
  onSettingsOpen,
  chatSplitWidth,
  docZoom = 1,
  onDocZoomIn,
  onDocZoomOut,
  onDocZoomReset,
}: LayoutProps) {
  const [zoomOpen, setZoomOpen] = useState(false)
  const zoomRef = useRef<HTMLDivElement>(null)

  // Close zoom popover on click outside
  useEffect(() => {
    if (!zoomOpen) return
    const handler = (e: MouseEvent) => {
      if (zoomRef.current && !zoomRef.current.contains(e.target as Node)) {
        setZoomOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [zoomOpen])

  return (
    <div
      className="h-full bg-surface flex flex-col overflow-hidden p-1.5"
      style={chatSplitWidth ? { paddingRight: chatSplitWidth } : undefined}
    >
      {/* Unified floating panel: header + content */}
      <div className="flex-1 flex flex-col min-h-0 rounded-xl overflow-hidden border border-border/60 shadow-[0_2px_16px_rgba(0,0,0,0.06)] bg-surface-card">

        {/* Header — inside the floating panel */}
        <header className="border-b border-border/40 bg-surface-alt/40 relative z-30 shrink-0">
          <div className="w-full px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            {/* Left: brand + subtitle */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <FileText className="w-5 h-5 text-primary shrink-0" />
              <div className="flex items-baseline gap-2 min-w-0">
                <span
                  onClick={currentFileName ? onBack : undefined}
                  className={`text-lg font-medium text-text tracking-tight whitespace-nowrap ${
                    currentFileName
                      ? 'cursor-pointer hover:text-primary transition-colors'
                      : ''
                  }`}
                  title={currentFileName ? '返回首页' : undefined}
                >
                  DocuSync
                </span>
                <span className="text-xs text-text-secondary tracking-wide hidden sm:inline whitespace-nowrap">
                  文档预览
                </span>
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Zoom control — browser-like scale of the DOCUMENT area */}
              {onDocZoomIn && onDocZoomOut && (
                <div className="relative" ref={zoomRef}>
                  <button
                    onClick={() => setZoomOpen((v) => !v)}
                    className={`
                      px-2 h-8 rounded-md text-xs font-medium transition-colors
                      ${zoomOpen
                        ? 'bg-surface-alt text-text'
                        : 'text-text-secondary hover:text-text hover:bg-surface-alt/60'
                      }
                    `}
                    title="缩放文档区（Ctrl/⌘ + 滚轮；桌面端 ⌘/Ctrl + 加号、减号，0 重置）"
                  >
                    {Math.round(docZoom * 100)}%
                  </button>

                  {zoomOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 flex items-center gap-1 p-1 w-max flex-nowrap bg-surface-card border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
                      style={{ transformOrigin: 'top right', animation: 'docusync-pop-in 140ms ease-out' }}
                    >
                      <button
                        onClick={() => { onDocZoomOut?.() }}
                        className="p-1.5 shrink-0 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
                        title="缩小文档区"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs text-text w-11 shrink-0 text-center select-none">
                        {Math.round(docZoom * 100)}%
                      </span>
                      <button
                        onClick={() => { onDocZoomIn?.() }}
                        className="p-1.5 shrink-0 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
                        title="放大文档区"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
                      <button
                        onClick={() => { onDocZoomReset?.() }}
                        className="px-2 py-1 shrink-0 whitespace-nowrap rounded-md text-[11px] text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
                        title="重置文档区为 100%"
                      >
                        重置
                      </button>
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

              {/* Settings button */}
              {onSettingsOpen && (
                <button
                  onClick={onSettingsOpen}
                  className="p-2 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt/60 transition-colors"
                  title="设置"
                >
                  <Settings className="w-4.5 h-4.5" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main content area — fills the rest of the floating panel */}
        <main className="flex-1 w-full flex flex-col min-h-0">
          {children}
        </main>

      </div>
    </div>
  )
}
