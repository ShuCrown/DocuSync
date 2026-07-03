import { useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MessageSquare, ChevronLeft, ChevronRight, PanelTop, Minus, X } from 'lucide-react'
import { type ChatPanelState } from '../hooks/useChatPanelTauri'

const NUDGE = 40

/**
 * Docusync-side chrome for the AI chat panel.
 *
 * - sidebar: a draggable divider at the right edge (widens the chat area by dragging left).
 *   Because ai-chat is a separate OS webview, the cursor cannot cross into it, so dragging
 *   right to narrow is handled by the ◀/▶ nudge buttons on the divider.
 * - minimized: a restore bubble.
 * - closed / popup: nothing (the floating panel owns its own injected header).
 *
 * `panel` is provided by ChatPanelContainer, which owns the single useChatPanel() instance.
 */
export function ChatPanel({ panel }: { panel: ChatPanelState }) {
  const mainWidthRef = useRef<number>(0)

  // Refresh the cached main-window width; used by the divider drag math.
  const refreshMainWidth = useCallback(async () => {
    try {
      const size = await invoke<[number, number]>('get_main_size')
      if (Array.isArray(size) && size.length === 2) mainWidthRef.current = size[0]
    } catch { /* ignore */ }
  }, [])

  // Populate the width cache on mount and whenever the mode flips into sidebar.
  useEffect(() => { void refreshMainWidth() }, [refreshMainWidth, panel.mode])

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const mainW = mainWidthRef.current || window.innerWidth + panel.sidebarWidth
        const newWidth = mainW - ev.clientX
        panel.resizeSidebar(newWidth)
      })
    }
    const stop = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stop)
      document.removeEventListener('mouseleave', stop)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stop)
    document.addEventListener('mouseleave', stop)
  }, [panel])

  // --- sidebar mode: draggable divider + nudge buttons ---
  if (panel.mode === 'sidebar') {
    return (
      <div
        onMouseDown={startDrag}
        className="fixed top-0 right-0 bottom-0 w-4 cursor-col-resize z-[9998] group"
        title="拖拽调整聊天宽度"
      >
        {/* Visible divider line */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-border group-hover:bg-primary/50 transition-colors" />
        {/* Wider hit area for easier grabbing */}
        <div className="absolute right-0 top-0 bottom-0 w-4" />

        {/* Center grip handle */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-5 h-10 rounded-full bg-surface-card border border-border shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="w-0.5 h-3 bg-border rounded-full" />
        </div>

        {/* Top control pill — mirrors the ai-chat header actions so the user can switch modes without leaving the DocuSync side */}
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-1 top-3 flex flex-col items-center gap-1 bg-surface-card border border-border rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.12)] px-1 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <button
            onClick={() => panel.switchToPopup()}
            className="p-1.5 rounded-md text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
            title="切换为悬浮窗口"
          >
            <PanelTop className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => panel.minimize()}
            className="p-1.5 rounded-md text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
            title="收起"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => panel.close()}
            className="p-1.5 rounded-md text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
            title="关闭"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Bottom nudge buttons */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-surface-card border border-border rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.12)] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => panel.resizeSidebar(panel.sidebarWidth + NUDGE)}
            className="p-1 rounded-full text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
            title="加宽聊天区"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => panel.resizeSidebar(panel.sidebarWidth - NUDGE)}
            className="p-1 rounded-full text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
            title="收窄聊天区"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    )
  }

  // --- minimized mode: restore bubble ---
  if (panel.mode === 'minimized') {
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

  // closed / popup: nothing to render on the docusync side
  return null
}
