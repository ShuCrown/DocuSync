import { useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'
import { getWindowInsets } from './useWindowInsets'
import { hexToRgba } from '../utils/color'
import type { ChatPanelState } from './useChatPanel'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// Inset the native webview so its sharp corners stay inside the panel's
// rounded corners. A native webview is an opaque rectangle that CSS
// `overflow-hidden` cannot clip; without this inset its corners protrude
// beyond the panel (the "chat overflows the panel" bug). Top stays flush (the
// webview sits right under the header, away from the top rounded corners);
// left/right/bottom are inset to clear the bottom rounded corners. Keep this
// in sync with the panel's `rounded-xl` radius (12px) in ChatPanel.tsx.
const WEBVIEW_INSET = 4

// Extra padding inside the webview area so AI service pages have breathing
// room instead of sitting flush against the panel edges.
const CONTENT_PADDING = 12
// The AI page lives in a native child webview that draws on top of the React
// DOM, so a React overlay can never tint it. Instead we inject a multiply
// overlay *inside* the webview at creation (Rust `PaperOverlay`), tinting the
// page with the app's paper color. Keep the alpha low — it is a warm tint,
// not a color change. Tune this constant to taste.
const PAPER_OVERLAY_ALPHA = 0.16

interface PaperOverlay {
  background: string
}

let paperOverlay: PaperOverlay | null | undefined

/** Paper-color overlay for the child webview, resolved once (single theme). */
function getPaperOverlay(): PaperOverlay | null {
  if (paperOverlay !== undefined) return paperOverlay
  const surface =
    getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() ||
    '#f5f4ed'
  paperOverlay = { background: hexToRgba(surface, PAPER_OVERLAY_ALPHA) }
  return paperOverlay
}

function readBounds(el: HTMLElement): Bounds {
  const r = el.getBoundingClientRect()
  const inset = WEBVIEW_INSET + CONTENT_PADDING
  return {
    x: r.left + inset,
    // Keep y at the top of the content area (no CONTENT_PADDING offset).
    // Adding a y offset causes the native webview to overlap the panel
    // header on macOS where Wry performs a Cocoa bottom-left flip.
    y: r.top,
    width: r.width - 2 * inset,
    // Bottom: WEBVIEW_INSET (rounded corners) + CONTENT_PADDING (breathing room)
    height: r.height - WEBVIEW_INSET - CONTENT_PADDING,
  }
}

function boundsEqual(a: Bounds, b: Bounds, eps = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  )
}

/**
 * Sync the AI chat child webview bounds with a React placeholder element.
 * In Tauri, the actual webview is a native child view positioned over the
 * placeholder; in the browser we fall back to a normal iframe.
 */
export function useTauriChatWebview(
  panel: ChatPanelState,
  contentRef: React.RefObject<HTMLElement | null>,
) {
  const appliedRef = useRef<Bounds | null>(null)
  const urlRef = useRef<string | null>(null)
  const rafRef = useRef<number>(0)
  const pendingRef = useRef<Bounds | null>(null)
  const hiddenRef = useRef(false)

  const apply = useCallback(async () => {
    if (!isTauri()) return
    const el = contentRef.current
    if (!el) return

    const bounds = readBounds(el)
    // On macOS, `getBoundingClientRect()` is measured against the window
    // frame while the child webview is positioned relative to the content
    // view; shift by the native titlebar inset (0 on Windows/Linux) so the
    // webview stays glued to its placeholder. Cached after the first call.
    bounds.y += (await getWindowInsets()).top
    const url = panel.currentUrl

    // Nothing to show.
    if (!url) return

    // Skip redundant updates.
    if (
      urlRef.current === url &&
      appliedRef.current &&
      boundsEqual(appliedRef.current, bounds)
    ) {
      return
    }

    try {
      if (urlRef.current !== url) {
        await invoke('create_ai_chat_webview', {
          url,
          bounds,
          overlay: getPaperOverlay(),
        })
        hiddenRef.current = false
      } else if (hiddenRef.current) {
        await invoke('show_ai_chat_webview', { bounds })
        hiddenRef.current = false
      } else {
        await invoke('update_ai_chat_webview', { bounds })
      }
      urlRef.current = url
      appliedRef.current = bounds
      pendingRef.current = null
    } catch (err) {
      console.error('[useTauriChatWebview] failed to sync webview:', err)
    }
  }, [panel.currentUrl, contentRef])

  const schedule = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      apply()
    })
  }, [apply])

  useEffect(() => {
    if (!isTauri()) return

    // Fully closed — destroy the webview, clear all state.
    if (panel.mode === 'closed') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      appliedRef.current = null
      urlRef.current = null
      hiddenRef.current = false
      invoke('close_ai_chat_webview').catch(() => {})
      return
    }

    // Collapsed — move webview offscreen without destroying it so page state survives.
    // Clear appliedRef so the restore path doesn't skip the reposition call.
    if (panel.mode === 'collapsed') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      hiddenRef.current = true
      appliedRef.current = null
      invoke('hide_ai_chat_webview').catch(() => {})
      return
    }

    // Panel is visible — sync bounds now and on resize/layout changes.
    schedule()

    const onResize = () => schedule()
    window.addEventListener('resize', onResize)

    let ro: ResizeObserver | null = null
    if (contentRef.current) {
      ro = new ResizeObserver(() => schedule())
      ro.observe(contentRef.current)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [panel.mode, panel.splitWidth, panel.floatingRect, panel.currentUrl, schedule, contentRef])

  // Close the webview when the component unmounts.
  useEffect(() => {
    return () => {
      if (!isTauri()) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      appliedRef.current = null
      urlRef.current = null
      invoke('close_ai_chat_webview').catch(() => {})
    }
  }, [])
}
