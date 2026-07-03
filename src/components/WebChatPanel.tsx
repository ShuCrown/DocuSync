import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, PanelTop, Minus, X, ExternalLink, GripVertical } from 'lucide-react'
import { type WebChatPanelState } from '../hooks/useWebChatPanel'

interface WebChatPanelProps {
  panel: WebChatPanelState
}

export function WebChatPanel({ panel }: WebChatPanelProps) {
  if (panel.mode === 'closed') return null
  if (panel.mode === 'minimized') return <RestoreBubble panel={panel} />
  if (panel.mode === 'popup') return <PopupPanel panel={panel} />
  return <SidebarPanel panel={panel} />
}

function RestoreBubble({ panel }: { panel: WebChatPanelState }) {
  return (
    <button
      onClick={panel.restore}
      className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-primary text-white shadow-lg flex items-center justify-center hover:bg-primary/90 hover:scale-105 transition-all z-[9999]"
      title="恢复 AI Chat"
    >
      <MessageSquare className="w-5 h-5" />
    </button>
  )
}

function SidebarPanel({ panel }: { panel: WebChatPanelState }) {
  const dividerRef = useRef<HTMLDivElement>(null)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const startX = e.clientX
    const startWidth = panel.sidebarWidth

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX
      panel.resizeSidebar(startWidth + delta)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panel])

  return (
    <>
      {/* Backdrop so clicks outside the panel close/minimize it on narrow viewports */}
      <div
        className="fixed inset-0 z-[9996] bg-black/5"
        onClick={panel.close}
      />
      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[9997] flex flex-col bg-surface-card border-l border-border shadow-[-4px_0_24px_rgba(0,0,0,0.08)]"
        style={{ width: panel.sidebarWidth }}
      >
        <PanelHeader panel={panel} />
        <div className="flex-1 min-h-0">
          <ChatIframe url={panel.currentUrl} title={panel.currentTitle} />
        </div>
      </div>
      {/* Draggable divider */}
      <div
        ref={dividerRef}
        onMouseDown={startResize}
        className="fixed top-0 bottom-0 z-[9998] w-4 cursor-col-resize group"
        style={{ right: panel.sidebarWidth - 8 }}
        title="拖拽调整聊天宽度"
      >
        <div className="absolute right-1/2 top-0 bottom-0 w-px bg-border group-hover:bg-primary/50 transition-colors translate-x-1/2" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-10 rounded-full bg-surface-card border border-border shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-0.5 h-3 bg-border rounded-full" />
        </div>
      </div>
    </>
  )
}

function PopupPanel({ panel }: { panel: WebChatPanelState }) {
  const headerRef = useRef<HTMLDivElement>(null)
  const [geometry, setGeometry] = useState({
    x: panel.popupX,
    y: panel.popupY,
    w: panel.popupWidth,
    h: panel.popupHeight,
  })

  const startDrag = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-popup-action]')) return
    e.preventDefault()
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'

    const startX = e.clientX
    const startY = e.clientY
    const origX = geometry.x
    const origY = geometry.y

    const onMove = (ev: MouseEvent) => {
      const nx = origX + (ev.clientX - startX)
      const ny = origY + (ev.clientY - startY)
      const clampedX = Math.max(0, Math.min(window.innerWidth - geometry.w, nx))
      const clampedY = Math.max(0, Math.min(window.innerHeight - geometry.h, ny))
      setGeometry((g) => ({ ...g, x: clampedX, y: clampedY }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [geometry.x, geometry.y, geometry.w, geometry.h])

  // Sync geometry back to the hook so restore/minimize keep the latest position.
  useEffect(() => {
    panel.movePopup(geometry.x, geometry.y)
  }, [geometry.x, geometry.y, panel])

  useEffect(() => {
    panel.resizePopup(geometry.w, geometry.h)
  }, [geometry.w, geometry.h, panel])

  return (
    <div
      className="fixed z-[9997] flex flex-col rounded-xl overflow-hidden bg-surface-card border border-border shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
      style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h }}
    >
      <div
        ref={headerRef}
        onMouseDown={startDrag}
        className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-alt/40 cursor-move select-none"
      >
        <GripVertical className="w-3.5 h-3.5 text-text-secondary/60" />
        <span className="text-xs font-medium text-text truncate flex-1">{panel.currentTitle || 'AI Chat'}</span>
        <div data-popup-action className="flex items-center gap-0.5">
          <HeaderButton onClick={panel.switchToSidebar} title="分屏" icon={<SidebarIcon />} />
          <HeaderButton onClick={panel.minimize} title="收起" icon={<Minus className="w-3.5 h-3.5" />} />
          <HeaderButton onClick={panel.close} title="关闭" icon={<X className="w-3.5 h-3.5" />} danger />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ChatIframe url={panel.currentUrl} title={panel.currentTitle} />
      </div>
    </div>
  )
}

function PanelHeader({ panel }: { panel: WebChatPanelState }) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border bg-surface-alt/40">
      <span className="text-xs font-medium text-text truncate flex-1">{panel.currentTitle || 'AI Chat'}</span>
      <div className="flex items-center gap-0.5">
        <HeaderButton onClick={panel.switchToPopup} title="悬浮窗口" icon={<PanelTop className="w-3.5 h-3.5" />} />
        <HeaderButton onClick={panel.minimize} title="收起" icon={<Minus className="w-3.5 h-3.5" />} />
        <HeaderButton onClick={panel.close} title="关闭" icon={<X className="w-3.5 h-3.5" />} danger />
      </div>
    </div>
  )
}

function HeaderButton({
  onClick,
  title,
  icon,
  danger,
}: {
  onClick: () => void
  title: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        p-1.5 rounded-md transition-colors
        ${danger
          ? 'text-text-secondary/70 hover:text-error hover:bg-error/10'
          : 'text-text-secondary/70 hover:text-primary hover:bg-surface-alt'
        }
      `}
    >
      {icon}
    </button>
  )
}

function SidebarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}

function ChatIframe({ url, title }: { url: string | null; title: string | null }) {
  if (!url) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary text-sm p-6 text-center">
        未选择聊天服务
      </div>
    )
  }

  return (
    <div key={url} className="relative h-full">
      <IframeLoader title={title} url={url} />
    </div>
  )
}

function IframeLoader({ url, title }: { url: string; title: string | null }) {
  const [loaded, setLoaded] = useState(false)
  const [maybeBlocked, setMaybeBlocked] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loaded) setMaybeBlocked(true)
    }, 6000)
    return () => clearTimeout(timer)
  }, [loaded])

  return (
    <>
      {!loaded && !maybeBlocked && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-text-secondary bg-surface-card">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">正在加载 {title || 'AI Chat'}…</span>
        </div>
      )}
      {maybeBlocked && (
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-warning/10 border-t border-warning/20 p-3 text-xs text-text">
          <div className="flex items-start gap-2">
            <span className="text-warning shrink-0">提示</span>
            <span className="flex-1">该服务可能不允许在当前窗口内嵌入，若页面空白请</span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline shrink-0"
            >
              在新标签页打开
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
      <iframe
        src={url}
        title={title || 'AI Chat'}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
        allow="clipboard-write; fullscreen"
        onLoad={() => setLoaded(true)}
      />
    </>
  )
}
