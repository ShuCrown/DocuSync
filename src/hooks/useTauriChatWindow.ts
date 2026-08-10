import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isTauri } from '../utils/tauri'
import type { ChatPanelState } from './useChatPanel'
import { getPaperOverlay } from './useTauriChatWebview'

/**
 * Standalone OS window for floating chat mode (Tauri only).
 *
 * Floating mode detaches the AI chat into a real OS-level window so it can be
 * moved outside the main application window and onto other monitors —
 * something the in-main-window child webview cannot do (child webviews are
 * always clipped by their parent window).
 *
 * Responsibilities:
 *   - When `mode === 'floating'`: create the standalone window (or reuse the
 *     existing one when the AI service changes while floating) at the persisted
 *     screen-space bounds, or — on first run — offset from the main window.
 *   - When `mode` leaves 'floating': close the window. `internal_close` (Rust)
 *     prevents the Destroyed handler from echoing a `ai-chat-window-closed`
 *     event back into `panel.close()` for programmatic closes.
 *   - Persist the window's screen-space position/size (reported via
 *     Moved/Resized events) to localStorage so the arrangement survives a
 *     restart. This is a SEPARATE key from `floatingRect`, which stays
 *     window-relative for the in-page browser overlay.
 *   - On user-initiated native close (window X button): Rust emits
 *     `ai-chat-window-closed` → call `panel.close()` so React state stays in
 *     sync (mode → closed, URL cleared).
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

const LS_WINDOW_BOUNDS = 'docusync.chatpanel.floatingWindowBounds'
const DEFAULT_W = 380
const DEFAULT_H = 560

function readWindowBounds(): Bounds | null {
  try {
    const raw = localStorage.getItem(LS_WINDOW_BOUNDS)
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

function writeWindowBounds(b: Bounds) {
  try {
    localStorage.setItem(LS_WINDOW_BOUNDS, JSON.stringify(b))
  } catch {
    /* ignore */
  }
}

/**
 * Resolve the window's initial screen-space bounds. Reuse the persisted
 * arrangement if any; otherwise place the window offset from the main window's
 * top-left so it doesn't open at the screen origin on first use.
 */
async function computeInitialBounds(): Promise<Bounds> {
  const stored = readWindowBounds()
  if (stored) return stored
  try {
    const main = getCurrentWindow()
    const [pos, sf] = await Promise.all([main.outerPosition(), main.scaleFactor()])
    return {
      x: pos.x / sf + 60,
      y: pos.y / sf + 60,
      width: DEFAULT_W,
      height: DEFAULT_H,
    }
  } catch {
    return { x: 80, y: 80, width: DEFAULT_W, height: DEFAULT_H }
  }
}

export function useTauriChatWindow(panel: ChatPanelState) {
  // Keep the latest `close` in a ref so the event listener (registered once)
  // never captures a stale closure. Updated in an effect (not during render)
  // per the react-hooks ref-during-render rule.
  const closeRef = useRef(panel.close)
  useEffect(() => {
    closeRef.current = panel.close
  }, [panel.close])

  // Create / reuse / close the standalone window on mode or URL changes.
  useEffect(() => {
    if (!isTauri()) return
    const url = panel.currentUrl

    if (panel.mode === 'floating') {
      if (!url) return
      let cancelled = false
      computeInitialBounds()
        .then((bounds) => {
          if (cancelled) return
          invoke('create_ai_chat_window', {
            url,
            bounds,
            overlay: getPaperOverlay(),
          }).catch((e) => console.error('[useTauriChatWindow] create failed:', e))
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }

    // Not floating — ensure any standalone window is closed. This runs on
    // split/closed/collapsed transitions. Rust's `internal_close` flag
    // suppresses the echo-back `ai-chat-window-closed` event.
    invoke('close_ai_chat_window').catch(() => {})
  }, [panel.mode, panel.currentUrl])

  // Persist native move/resize, and translate user-initiated close into
  // `panel.close()`. Registered once for the component's lifetime.
  useEffect(() => {
    if (!isTauri()) return
    let unlistens: UnlistenFn[] = []
    let cancelled = false
    Promise.all([
      listen<Bounds>('ai-chat-window-bounds', (e) => writeWindowBounds(e.payload)),
      listen('ai-chat-window-closed', () => closeRef.current()),
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
  }, [])
}
