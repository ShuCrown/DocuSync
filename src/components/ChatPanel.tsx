import { useCallback, useEffect, useRef } from 'react'
import {
  Columns2,
  PictureInPicture2,
  Minus,
  X,
  MessageSquare,
} from 'lucide-react'
import {
  type ChatPanelState,
  CHAT_PANEL_SPLIT_MIN,
  CHAT_PANEL_SPLIT_MAX,
  CHAT_PANEL_FLOAT_MIN_WIDTH,
  CHAT_PANEL_FLOAT_MIN_HEIGHT,
  CHAT_PANEL_FLOAT_MAX_WIDTH,
  CHAT_PANEL_FLOAT_MAX_HEIGHT,
} from '../hooks/useChatPanel'
import { useTauriChatWebview } from '../hooks/useTauriChatWebview'
import { isTauri } from '../utils/tauri'

interface ChatPanelProps {
  panel: ChatPanelState
}

/**
 * AI chat panel with a React header and a native Tauri child webview for the
 * content area.
 *
 * Why a child webview instead of an iframe?
 *   DeepSeek, Qianwen and other AI services set CSP `frame-ancestors` headers
 *   that forbid iframe embedding. A Tauri child webview is a top-level view
 *   inside the main window and is not subject to that restriction.
 *
 *   - split mode: docked on the right with a draggable left-edge divider that
 *     resizes `panel.splitWidth`.
 *   - floating mode: a position:fixed overlay dragged by its header, sized
 *     and positioned via `panel.floatingRect`.
 *   - collapsed mode: component stays mounted but hidden via CSS so the
 *     native webview preserves its page state.
 *
 * The header exposes four actions: switch layout (split ↔ floating), collapse
 * (hide + show restore bubble), close (fully hide), and open-in-new-tab.
 * In browser builds we fall back to a normal iframe.
 */
export function ChatPanel({ panel }: ChatPanelProps) {
  const isFloating = panel.mode === 'floating'
  const isCollapsed = panel.mode === 'collapsed'
  const contentRef = useRef<HTMLDivElement | null>(null)
  const startDividerDrag = useDividerDrag(panel)
  const startHeaderDrag = useHeaderDrag(panel)
  const startResize = useResizeDrag(panel)

  useTauriChatWebview(panel, contentRef)

  // Collapsed: keep mounted but invisible so the native webview survives.
  if (isCollapsed) {
    return <div style={{ display: 'none' }} ref={contentRef} />
  }

  // All modes use fixed positioning so the component never moves between
  // DOM parents (which would unmount/remount and destroy the native webview).
  //
  // All four corners stay rounded (rounded-xl). The chat body is a native
  // Tauri child webview - an opaque rectangle that CSS `overflow-hidden`
  // cannot clip - so useTauriChatWebview.ts shrinks the webview inside the
  // panel (WEBVIEW_PADDING) and the placeholder background below shows
  // through around it as the rounded-corner frame. Keep WEBVIEW_PADDING in
  // sync with this radius (rounded-xl = 12px), and keep the placeholder
  // background as the paper color (bg-surface) so the frame blends with the
  // tinted webview content instead of a white rectangle.
  const containerClass = 'fixed z-[9998] flex flex-col bg-surface-card overflow-hidden border border-border/60 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)]'
    + (!isFloating ? ' border-l-2 border-l-border' : '')

  const containerStyle = isFloating
    ? {
        left: panel.floatingRect.x,
        top: panel.floatingRect.y,
        width: panel.floatingRect.width,
        height: panel.floatingRect.height,
      }
    : {
        right: 6,
        top: 6, // aligned with the main floating panel's padding
        width: panel.splitWidth,
        bottom: 6,
      }

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Header — doubles as the drag handle in floating mode */}
      <div
        onMouseDown={isFloating ? startHeaderDrag : undefined}
        className={`flex items-center gap-1.5 px-2.5 h-9 border-b border-border/40 bg-surface-alt/40 shrink-0 ${
          isFloating ? 'cursor-move select-none' : ''
        }`}
      >
        <span className="text-xs font-medium text-text truncate flex-1 min-w-0" title={panel.currentTitle ?? 'AI Chat'}>
          {panel.currentTitle ?? 'AI Chat'}
        </span>

        {/* Switch layout: split ↔ floating */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => (isFloating ? panel.switchToSplit() : panel.switchToFloating())}
          className="p-1 rounded text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
          title={isFloating ? '切换为分屏' : '切换为悬浮窗口'}
        >
          {isFloating ? <Columns2 className="w-3.5 h-3.5" /> : <PictureInPicture2 className="w-3.5 h-3.5" />}
        </button>

        {/* Collapse — hide panel, show restore bubble */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={panel.collapse}
          className="p-1 rounded text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
          title="收起"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* Close — fully hide panel */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={panel.close}
          className="p-1 rounded text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body — a placeholder element whose bounds are mirrored to the native
          child webview. The divider strip sits to the left in split mode so it
          remains reachable (the webview would otherwise swallow it). */}
      <div className="flex-1 min-h-0 flex flex-row">
        {!isFloating && (
          <div
            onMouseDown={startDividerDrag}
            className="w-1.5 shrink-0 cursor-col-resize flex items-center justify-center group"
            title="拖拽调整聊天宽度"
          >
            <div className="w-px h-full bg-border/60 group-hover:bg-primary/40 transition-colors" />
          </div>
        )}
        {/* bg-surface (paper color): the strip exposed around the inset
            native webview doubles as the rounded-corner frame — it must
            blend with the tinted webview content, not a white rectangle. */}
        <div ref={contentRef} className="flex-1 min-w-0 bg-surface relative">
          {isTauri() ? (
            panel.currentUrl ? (
              // The native webview draws over this area. Keep a subtle background
              // so the panel does not flash transparent while Tauri creates it.
              <div className="absolute inset-0 bg-surface" />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-text-secondary">
                未选择 AI 服务
              </div>
            )
          ) : panel.currentUrl ? (
            <div className="p-3 w-full h-full">
              <iframe
                src={panel.currentUrl}
                title={panel.currentTitle ?? 'AI Chat'}
                className="w-full h-full border-0 rounded-lg"
                allow="clipboard-read; clipboard-write; popup; popups-to-escape-sandbox"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-text-secondary">
              未选择 AI 服务
            </div>
          )}
        </div>
      </div>

      {/* Resize handles — floating mode only.
          The native child webview is inset 4px (WEBVIEW_PADDING) inside the
          content area, so the outer ~4px of each edge remains clickable even
          in Tauri mode. Handles are transparent; the cursor change signals
          the resize affordance. */}
      {isFloating && (
        <>
          <div onMouseDown={(e) => startResize(e, 'w')} className="absolute top-0 left-0 w-1.5 h-full cursor-ew-resize z-20" />
          <div onMouseDown={(e) => startResize(e, 'e')} className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize z-20" />
          <div onMouseDown={(e) => startResize(e, 's')} className="absolute bottom-0 left-0 w-full h-1.5 cursor-ns-resize z-20" />
          <div onMouseDown={(e) => startResize(e, 'sw')} className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-20" />
          <div onMouseDown={(e) => startResize(e, 'se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-20" />
        </>
      )}
    </div>
  )
}

/**
 * Restore bubble shown when the panel is collapsed. One click returns the panel
 * to its last layout mode (split or floating).
 */
export function ChatRestoreBubble({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-4 right-4 w-11 h-11 rounded-xl bg-surface-card text-primary border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex items-center justify-center hover:bg-surface-alt/50 hover:scale-105 transition-all z-[9999]"
      title="恢复 AI Chat"
    >
      <MessageSquare className="w-4.5 h-4.5" />
    </button>
  )
}

// --- Split-mode divider drag: dragging left widens the chat pane ---

function useDividerDrag(panel: ChatPanelState) {
  return useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panel.splitWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        // Dragging left (delta < 0) widens the right-side chat pane.
        const next = startWidth + (startX - ev.clientX)
        panel.setSplitWidth(Math.max(CHAT_PANEL_SPLIT_MIN, Math.min(CHAT_PANEL_SPLIT_MAX, next)))
      })
    }
    const stop = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stop)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stop)
  }, [panel])
}

// --- Floating-mode header drag: move the overlay within the viewport ---

function useHeaderDrag(panel: ChatPanelState) {
  const rectRef = useRef(panel.floatingRect)
  useEffect(() => { rectRef.current = panel.floatingRect }, [panel.floatingRect])

  return useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const orig = rectRef.current
    document.body.style.cursor = 'move'
    document.body.style.userSelect = 'none'
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const maxX = Math.max(0, window.innerWidth - orig.width)
        const maxY = Math.max(0, window.innerHeight - orig.height)
        const x = Math.max(0, Math.min(maxX, orig.x + (ev.clientX - startX)))
        const y = Math.max(0, Math.min(maxY, orig.y + (ev.clientY - startY)))
        panel.setFloatingRect({ ...orig, x, y })
      })
    }
    const stop = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stop)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stop)
  }, [panel])
}

// --- Floating-mode resize: drag an edge/corner to resize the overlay ---
//
// Supported directions: e (right), w (left), s (bottom), se, sw.
// The top edge and top corners are intentionally excluded — the header
// occupies the top and serves as the move handle.
//
// When resizing from the left (w/sw) the right edge stays fixed and x is
// derived as (rightEdge - width) so the window grows/shrinks leftward
// without jumping. Width and height are clamped to [FLOAT_MIN, FLOAT_MAX]
// and capped so the window never extends past the viewport.

type ResizeDir = 'e' | 'w' | 's' | 'se' | 'sw'

function cursorFor(dir: ResizeDir): string {
  switch (dir) {
    case 'e':
    case 'w':
      return 'ew-resize'
    case 's':
      return 'ns-resize'
    case 'se':
      return 'nwse-resize'
    case 'sw':
      return 'nesw-resize'
  }
}

function useResizeDrag(panel: ChatPanelState) {
  const rectRef = useRef(panel.floatingRect)
  useEffect(() => { rectRef.current = panel.floatingRect }, [panel.floatingRect])

  return useCallback((e: React.MouseEvent, dir: ResizeDir) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const orig = rectRef.current
    document.body.style.cursor = cursorFor(dir)
    document.body.style.userSelect = 'none'
    let raf = 0
    const onMove = (ev: MouseEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let { x, width, height } = orig
        // y is never reassigned (no top-edge resize) — keep it as orig.y.

        // Horizontal resize
        if (dir === 'e' || dir === 'se') {
          // Right edge moves, left edge (orig.x) stays fixed.
          const maxW = Math.min(CHAT_PANEL_FLOAT_MAX_WIDTH, window.innerWidth - orig.x)
          width = Math.max(CHAT_PANEL_FLOAT_MIN_WIDTH, Math.min(maxW, orig.width + dx))
        } else if (dir === 'w' || dir === 'sw') {
          // Left edge moves, right edge (orig.x + orig.width) stays fixed.
          const rightEdge = orig.x + orig.width
          const maxW = Math.min(CHAT_PANEL_FLOAT_MAX_WIDTH, rightEdge)
          width = Math.max(CHAT_PANEL_FLOAT_MIN_WIDTH, Math.min(maxW, orig.width - dx))
          x = rightEdge - width
        }

        // Vertical resize (only bottom edge directions)
        if (dir === 's' || dir === 'se' || dir === 'sw') {
          const maxH = Math.min(CHAT_PANEL_FLOAT_MAX_HEIGHT, window.innerHeight - orig.y)
          height = Math.max(CHAT_PANEL_FLOAT_MIN_HEIGHT, Math.min(maxH, orig.height + dy))
        }

        panel.setFloatingRect({ x, y: orig.y, width, height })
      })
    }
    const stop = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stop)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stop)
  }, [panel])
}
