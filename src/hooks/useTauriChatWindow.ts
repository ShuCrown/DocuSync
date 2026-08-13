import { useEffect, useRef, useState, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isTauri } from '../utils/tauri'
import type { ChatPanelState } from './useChatPanel'
import { getPaperOverlay } from './useTauriChatWebview'
import { useZoomScale } from './useZoom'

/**
 * Standalone OS window per floating chat panel (Tauri only).
 *
 * Floating mode detaches each chat panel into a real OS-level window so it can
 * be moved outside the main application window and onto other monitors —
 * something the in-main-window child webview cannot do (child webviews are
 * always clipped by their parent window). With multi-instance panels, every
 * floating panel gets its OWN window (labelled `ai-chat-window-{panel.id}`),
 * so several AI services can be compared side by side as real windows.
 *
 * Responsibilities:
 *   - When `mode === 'floating'`: create the standalone window (or reuse the
 *     existing one when the AI service changes while floating) at the persisted
 *     screen-space bounds, or — on first run — offset from the main window.
 *   - When `mode` leaves 'floating': close the window. `internal_close` (Rust)
 *     prevents the Destroyed handler from echoing a `ai-chat-window-closed`
 *     event back into `panel.close()` for programmatic closes.
 *   - Persist each window's screen-space position/size (reported via
 *     Moved/Resized events) to localStorage keyed by panel id so the
 *     arrangement survives a restart.
 *   - On user-initiated native close (window X button): Rust emits
 *     `ai-chat-window-closed` (payload carries the window label) → the matching
 *     panel calls `panel.close()` so React state stays in sync.
 *
 * Browser builds: no-op (`isTauri()` is false); floating mode there keeps
 * using the in-page overlay managed by `useTauriChatWebview`.
 */

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

interface LabeledBounds extends Bounds {
  label: string
}

const WINDOW_LABEL_PREFIX = 'ai-chat-window-'
const LS_WINDOW_BOUNDS_PREFIX = 'docusync.chatpanel.floatingWindowBounds.'

function windowLabelFor(id: string): string {
  return WINDOW_LABEL_PREFIX + id
}

function readWindowBounds(id: string): Bounds | null {
  try {
    const raw = localStorage.getItem(LS_WINDOW_BOUNDS_PREFIX + id)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<Bounds>
    if (
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      !Number.isFinite(p.width) ||
      !Number.isFinite(p.height)
    ) {
      return null
    }
    return { x: p.x!, y: p.y!, width: p.width!, height: p.height! }
  } catch {
    return null
  }
}

function writeWindowBounds(id: string, b: Bounds) {
  try {
    localStorage.setItem(LS_WINDOW_BOUNDS_PREFIX + id, JSON.stringify(b))
  } catch {
    /* ignore */
  }
}

/**
 * Resolve the window's initial screen-space bounds. Reuse the persisted
 * arrangement for this panel if any; otherwise place the window offset from
 * the main window's top-left by this panel's floating rect (which cascades as
 * more panels open, so multiple windows don't stack exactly on top of each
 * other on first run).
 */
async function computeInitialBounds(id: string, rect: Bounds): Promise<Bounds> {
  const stored = readWindowBounds(id)
  if (stored) return stored
  try {
    const main = getCurrentWindow()
    const [pos, sf] = await Promise.all([main.outerPosition(), main.scaleFactor()])
    return {
      x: pos.x / sf + rect.x,
      y: pos.y / sf + rect.y,
      width: rect.width,
      height: rect.height,
    }
  } catch {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }
}

/**
 * Result of `useTauriChatWindow` — lets the floating-mode UI in the main
 * window mirror the standalone window's real state and drive it. "收起"
 * (collapse) HIDES the window entirely (screen + Dock/taskbar), leaving only
 * the bottom-right restore bubble; "恢复" (restore) shows and focuses it.
 */
export interface FloatingWindowControls {
  /** Whether the standalone floating window is collapsed (hidden). */
  minimized: boolean
  /** Collapse ("收起") — hide the standalone floating window. */
  minimize: () => void
  /** Restore ("恢复") a collapsed standalone floating window. */
  restore: () => void
}

export function useTauriChatWindow(panel: ChatPanelState): FloatingWindowControls {
  const id = panel.id
  const label = windowLabelFor(id)
  const [minimized, setMinimized] = useState(false)
  // Keep the latest `close` in a ref so the event listener (registered once)
  // never captures a stale closure. Updated in an effect (not during render)
  // per the react-hooks ref-during-render rule.
  const closeRef = useRef(panel.close)
  useEffect(() => {
    closeRef.current = panel.close
  }, [panel.close])
  // Latest zoom values — read at window-creation time without re-running the
  // create effect on every zoom change (zoom changes are handled by the
  // separate `set_ai_chat_window_zoom` effect below).
  const zoomRef = useRef(panel.zoom)
  useEffect(() => {
    zoomRef.current = panel.zoom
  }, [panel.zoom])
  const uiZoom = useZoomScale()
  const uiZoomRef = useRef(uiZoom)
  useEffect(() => {
    uiZoomRef.current = uiZoom
  }, [uiZoom])
  // Latest prompt — read at window-creation time; prompt CHANGES on an already
  // existing window are handled by the separate fill effect below.
  const promptRef = useRef(panel.pendingPrompt)
  useEffect(() => {
    promptRef.current = panel.pendingPrompt
  }, [panel.pendingPrompt])

  const minimize = useCallback(() => {
    if (!isTauri()) return
    invoke('hide_ai_chat_window', { label })
      .then(() => setMinimized(true))
      .catch((e) => console.error('[useTauriChatWindow] hide failed:', e))
  }, [label])

  const restore = useCallback(() => {
    if (!isTauri()) return
    invoke('show_ai_chat_window', { label })
      .then(() => setMinimized(false))
      .catch((e) => console.error('[useTauriChatWindow] show failed:', e))
  }, [label])

  // Create / reuse / close the standalone window on mode or URL changes.
  useEffect(() => {
    if (!isTauri()) return
    const url = panel.currentUrl
    const rect = panel.floatingRect

    if (panel.mode === 'floating') {
      if (!url) return
      let cancelled = false
      computeInitialBounds(id, rect)
        .then((bounds) => {
          if (cancelled) return
          return invoke('create_ai_chat_window', {
            label,
            url,
            bounds,
            overlay: getPaperOverlay(),
            scale: uiZoomRef.current * zoomRef.current,
            prompt: promptRef.current || null,
          })
        })
        .then(() => {
          // The window was just created (or reused via show()), so it is
          // visible — never let a stale "已收起" state survive a
          // split→floating round trip.
          if (!cancelled) setMinimized(false)
        })
        .catch((e) => console.error('[useTauriChatWindow] create failed:', e))
      return () => {
        cancelled = true
      }
    }

    // Not floating — ensure the standalone window is closed. This runs on
    // split/closed/collapsed transitions. Rust's `internal_close` flag
    // suppresses the echo-back `ai-chat-window-closed` event.
    invoke('close_ai_chat_window', { label }).catch(() => {})
  }, [panel.mode, panel.currentUrl, panel.floatingRect, id, label])

  // Per-panel zoom: sync the floating window's native zoom whenever the
  // panel's zoom control OR the global UI zoom changes (final = uiZoom ×
  // panel.zoom; each chat still scales independently relative to the UI).
  useEffect(() => {
    if (!isTauri()) return
    invoke('set_ai_chat_window_zoom', { label, scale: uiZoom * panel.zoom }).catch(() => {})
  }, [label, uiZoom, panel.zoom])

  // Prompt changed on an ALREADY-EXISTING floating window (user re-opened the
  // same service with new text). The window is NOT recreated (that would lose
  // the conversation), so the prompt is re-applied via `eval`. On first
  // creation the prompt is passed to `create_ai_chat_window` directly; a
  // redundant fill here is harmless (the script overwrites with the same text).
  useEffect(() => {
    if (!isTauri()) return
    if (panel.mode !== 'floating') return
    if (!panel.pendingPrompt) return
    invoke('fill_ai_chat_window', { label, prompt: panel.pendingPrompt }).catch(() => {})
  }, [label, panel.mode, panel.pendingPrompt])

  // Persist native move/resize, translate user-initiated close into
  // `panel.close()`, and mirror the native minimize state. Registered once for
  // the component's lifetime; events carry the window label so only the
  // matching panel reacts.
  useEffect(() => {
    if (!isTauri()) return
    let unlistens: UnlistenFn[] = []
    let cancelled = false
    Promise.all([
      listen<LabeledBounds>('ai-chat-window-bounds', (e) => {
        if (e.payload.label === label) {
          writeWindowBounds(id, {
            x: e.payload.x,
            y: e.payload.y,
            width: e.payload.width,
            height: e.payload.height,
          })
        }
      }),
      listen<{ label: string }>('ai-chat-window-closed', (e) => {
        if (e.payload.label === label) closeRef.current()
      }),
      listen<{ label: string; minimized: boolean }>('ai-chat-window-minimized', (e) => {
        if (e.payload.label === label) setMinimized(e.payload.minimized)
      }),
    ])
      .then((fns) => {
        if (cancelled) {
          fns.forEach((u) => u())
        } else {
          unlistens = fns
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
      unlistens.forEach((u) => u())
    }
  }, [id, label])

  // Unmount safety net: closing the panel from the main-window pill removes
  // the panel from React state and unmounts this component, but the standalone
  // OS window is owned by Rust — without this, that window would linger on
  // screen forever while the UI already shows the chat as closed.
  useEffect(() => {
    return () => {
      if (!isTauri()) return
      invoke('close_ai_chat_window', { label }).catch(() => {})
    }
  }, [label])

  return { minimized, minimize, restore }
}
