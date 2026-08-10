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
  CHAT_PANEL_FLOAT_MIN_WIDTH,
  CHAT_PANEL_FLOAT_MIN_HEIGHT,
  CHAT_PANEL_FLOAT_MAX_WIDTH,
  CHAT_PANEL_FLOAT_MAX_HEIGHT,
} from '../hooks/useChatPanel'
import { useTauriChatWebview } from '../hooks/useTauriChatWebview'
import { useTauriChatWindow } from '../hooks/useTauriChatWindow'
import { isTauri } from '../utils/tauri'

interface ChatPanelProps {
  panel: ChatPanelState
  /** Stacking index for the floating control pill (multi-window support). */
  floatingPillIndex?: number
  /**
   * Right offset (px) for the floating control pill. When a split panel is
   * docked, its native child webview draws OVER the React DOM, so a pill at
   * the default right edge would be hidden behind it — shift the pill left of
   * the docked panel instead.
   */
  floatingPillRight?: number
  /**
   * Dock rect for a split-mode panel, computed by App from the panel's
   * `dockRatio` (multiple docked panels stack like document split panes).
   * Vertical direction uses dockTop/dockHeight; horizontal uses
   * dockLeft/dockWidth.
   */
  dockTop?: number
  dockHeight?: number
  dockLeft?: number
  dockWidth?: number
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
 * One panel instance per AI service (see useChatPanel): opening a different
 * service spawns another ChatPanel, so multiple chats can be compared side by
 * side as separate windows.
 *
 *   - split mode: docked on the right with a draggable left-edge divider that
 *     resizes `panel.splitWidth`. Uses an in-main-window child webview.
 *   - floating mode: in Tauri, the chat detaches into a standalone OS window
 *     (see useTauriChatWindow) so it can move outside the main window and onto
 *     other monitors; this component renders just a small control pill in the
 *     main window (switch-to-split / close). In the browser, floating stays an
 *     in-page position:fixed overlay dragged by its header and resized via
 *     edge handles, sized/positioned via `panel.floatingRect`.
 *   - collapsed mode: component stays mounted but hidden via CSS so the
 *     native webview preserves its page state.
 *
 * The header exposes four actions: switch layout (split ↔ floating), collapse
 * (hide + show restore bubble), close (fully hide), and open-in-new-tab.
 * In browser builds we fall back to a normal iframe.
 */
export function ChatPanel({
  panel,
  floatingPillIndex = 0,
  floatingPillRight,
  dockTop,
  dockHeight,
  dockLeft,
  dockWidth,
}: ChatPanelProps) {
  const isFloating = panel.mode === 'floating'
  const isCollapsed = panel.mode === 'collapsed'
  // Tauri floating mode uses a standalone OS window instead of an in-page
  // overlay; only the browser still renders the full floating overlay.
  const isTauriFloating = isTauri() && isFloating
  const contentRef = useRef<HTMLDivElement | null>(null)
  const startHeaderDrag = useHeaderDrag(panel)
  const startResize = useResizeDrag(panel)

  useTauriChatWebview(panel, contentRef)
  useTauriChatWindow(panel)

  // Collapsed: keep mounted but invisible so the native webview (or iframe in
  // the browser) preserves its page state.
  if (isCollapsed) {
    return (
      <div style={{ display: 'none' }} ref={contentRef}>
        {!isTauri() && panel.currentUrl && (
          <iframe
            src={panel.currentUrl}
            title={panel.currentTitle ?? 'AI Chat'}
            className="w-full h-full border-0"
            allow="clipboard-read; clipboard-write; popup; popups-to-escape-sandbox"
          />
        )}
      </div>
    )
  }

  // Tauri floating mode: the chat lives in a standalone OS window managed by
  // useTauriChatWindow. Here we only render a compact control pill in the main
  // window so the user can switch back to split or close the chat without
  // having to focus the floating window. The pill is plain React and can call
  // panel actions directly — no remote-page IPC needed.
  if (isTauriFloating) {
    return <ChatFloatingPill panel={panel} index={floatingPillIndex} right={floatingPillRight} />
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

  const containerStyle = isFloating
    ? {
        left: panel.floatingRect.x,
        top: panel.floatingRect.y,
        width: panel.floatingRect.width,
        height: panel.floatingRect.height,
      }
    : panel.dockDirection === 'horizontal'
      ? {
          left: dockLeft ?? 6,
          top: 6,
          width: dockWidth ?? (typeof window !== 'undefined' ? window.innerWidth - 12 : 0),
          bottom: 6,
        }
      : {
          right: 6,
          top: dockTop ?? 6,
          width: panel.splitWidth,
          height: dockHeight ?? (typeof window !== 'undefined' ? window.innerHeight - 12 : 0),
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
        <span
          className="text-xs font-medium text-text truncate flex-1 min-w-0"
          title={panel.currentTitle ?? 'AI Chat'}
        >
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
          child webview. The width divider between the document area and this
          panel lives OUTSIDE, as a fixed strip rendered by App (see
          chatSplitWidth / handleChatWidthDrag). */}
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
 * to its last layout mode (split or floating). Multiple collapsed panels stack
 * their bubbles along the bottom-right corner. When a split panel is docked,
 * pass `right` so the bubbles stay left of its native webview (which draws
 * over the React DOM).
 */
export function ChatRestoreBubble({
  onClick,
  index = 0,
  right,
}: {
  onClick: () => void
  index?: number
  right?: number
}) {
  return (
    <button
      onClick={onClick}
      className="fixed w-11 h-11 rounded-xl bg-surface-card text-primary border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex items-center justify-center hover:bg-surface-alt/50 hover:scale-105 transition-all z-[9999]"
      style={{ bottom: 16 + index * 52, right: right ?? 16 }}
      title="恢复 AI Chat"
    >
      <MessageSquare className="w-4.5 h-4.5" />
    </button>
  )
}

/**
 * Compact control pill rendered in the main window while the chat is detached
 * into a standalone floating OS window (Tauri floating mode). The floating
 * window itself is a native OS window with its own titlebar (move / resize /
 * minimize / close); this pill just gives the user an in-main-window handle to
 * switch back to split mode or close the chat without focusing the floating
 * window. Native window close is also wired to `panel.close()` via Rust's
 * `ai-chat-window-closed` event (see useTauriChatWindow).
 */
function ChatFloatingPill({
  panel,
  index = 0,
  right,
}: {
  panel: ChatPanelState
  index?: number
  right?: number
}) {
  return (
    <div
      className="fixed z-[9998] flex items-center gap-1.5 pl-2.5 pr-1 h-9 rounded-xl bg-surface-card border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)]"
      style={{ top: 12 + index * 44, right: right ?? 12 }}
    >
      <span
        className="text-xs font-medium text-text truncate max-w-[160px]"
        title={panel.currentTitle ?? 'AI Chat'}
      >
        {panel.currentTitle ?? 'AI Chat'}
      </span>
      <span className="text-[10px] text-text-secondary select-none">悬浮中</span>

      {/* Switch back to split (re-dock into the main window) */}
      <button
        onClick={panel.switchToSplit}
        className="p-1 rounded text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
        title="切换为分屏"
      >
        <Columns2 className="w-3.5 h-3.5" />
      </button>

      {/* Close: closes the floating window and the chat entirely */}
      <button
        onClick={panel.close}
        className="p-1 rounded text-text-secondary hover:text-error hover:bg-error/10 transition-colors"
        title="关闭"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
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
