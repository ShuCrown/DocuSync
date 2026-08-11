import { useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'
import { getWindowInsets } from './useWindowInsets'
import { hexToRgba } from '../utils/color'
import { useZoomScale } from './useZoom'
import type { ChatPanelState } from './useChatPanel'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// Inset the native webview so its sharp corners never cut across the panel's
// rounded corners. A native child webview is an opaque rectangle that CSS
// `overflow-hidden` cannot clip, so instead of clipping we shrink it inside
// the panel and let the panel's background (paper color, see ChatPanel.tsx)
// show around it: the exposed strip is the rounded-corner frame, making the
// AI page look inset like a card instead of a hard rectangle.
//
// Top stays at 0: the webview sits right under the header (no rounded corner
// there), and a y-offset makes it overlap the header on macOS (Wry performs
// a Cocoa bottom-left flip). 4px is the compact inset this design calls for:
// smaller than the rounded-xl arc (12px), so the corners overlap the arc
// slightly — visually negligible and keeps the panel tight. Keep in sync
// with ChatPanel.tsx.
const WEBVIEW_PADDING = {
  top: 0,
  left: 4,
  right: 4,
  bottom: 4,
}
// The AI page lives in a native child webview that draws on top of the React
// DOM, so a React overlay can never tint it. Instead we inject a multiply
// overlay *inside* the webview at creation (Rust `PaperOverlay`), tinting the
// page with the app's paper color. Keep the alpha low — it is a warm tint,
// not a color change. Tune this constant to taste.
const PAPER_OVERLAY_ALPHA = 0.16

export interface PaperOverlay {
  background: string
}

let paperOverlay: PaperOverlay | null | undefined

/**
 * Paper-color overlay for the AI chat webviews, resolved once (single theme).
 * Shared by the in-main-window child webviews (split mode) and the standalone
 * floating OS windows — both tint the remote AI page the same way.
 */
export function getPaperOverlay(): PaperOverlay | null {
  if (paperOverlay !== undefined) return paperOverlay
  const surface =
    getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() ||
    '#f5f4ed'
  paperOverlay = { background: hexToRgba(surface, PAPER_OVERLAY_ALPHA) }
  return paperOverlay
}

function readBounds(el: HTMLElement): Bounds {
  const r = el.getBoundingClientRect()
  return {
    x: r.left + WEBVIEW_PADDING.left,
    // Keep y at the top of the content area (no top padding): adding a y
    // offset makes the native webview overlap the panel header on macOS
    // where Wry performs a Cocoa bottom-left flip.
    y: r.top + WEBVIEW_PADDING.top,
    width: r.width - WEBVIEW_PADDING.left - WEBVIEW_PADDING.right,
    height: r.height - WEBVIEW_PADDING.top - WEBVIEW_PADDING.bottom,
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
 * Keep ONE AI chat child webview (`label`) in sync with its React placeholder
 * element. Each chat panel instance owns its own webview, labelled
 * `ai-chat-{panelId}`, created lazily when its URL is set.
 *
 * `layoutKey` forces a re-sync when the panel's dock layout changes (e.g.
 * switching the dock direction vertical↔horizontal): the placeholder's
 * position/size can change without a resize, and a stale native webview would
 * keep covering its old spot.
 */
function useChatWebview(
  mode: ChatPanelState['mode'],
  url: string | null,
  label: string,
  contentRef: React.RefObject<HTMLElement | null>,
  layoutKey?: string,
  /**
   * Sidebar-level collapse (all docked panels hidden at once, e.g. the chat
   * sidebar "收起"): like the per-panel `collapsed` mode, hide the native
   * webview without destroying it so the page keeps its state. Passed from
   * App when the whole docked sidebar is collapsed; when it flips back to
   * false the webview is re-shown at its placeholder's current bounds.
   */
  hidden = false,
  /** UI zoom scale — applied to the native webview so its content zooms with
   * the rest of the interface (the webview element is sized at the scaled
   * rect; this makes the page lay out at the logical size). */
  scale = 1,
) {
  const appliedRef = useRef<Bounds | null>(null)
  const urlRef = useRef<string | null>(null)
  const rafRef = useRef<number>(0)
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
          label,
          url,
          bounds,
          overlay: getPaperOverlay(),
          scale,
        })
        hiddenRef.current = false
      } else if (hiddenRef.current) {
        await invoke('show_ai_chat_webview', { label, bounds })
        hiddenRef.current = false
      } else {
        await invoke('update_ai_chat_webview', { label, bounds })
      }
      urlRef.current = url
      appliedRef.current = bounds
    } catch (err) {
      console.error(`[useTauriChatWebview] failed to sync webview (${label}):`, err)
    }
  }, [url, label, contentRef, scale])

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
    if (mode === 'closed') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      appliedRef.current = null
      urlRef.current = null
      hiddenRef.current = false
      invoke('close_ai_chat_webview', { label }).catch(() => {})
      return
    }

    // Collapsed (per-panel or whole sidebar) — move webview offscreen without
    // destroying it so page state survives. Clear appliedRef so the restore
    // path doesn't skip the reposition call.
    if (mode === 'collapsed' || hidden) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      hiddenRef.current = true
      appliedRef.current = null
      invoke('hide_ai_chat_webview', { label }).catch(() => {})
      return
    }

    // Floating (Tauri) — handled by a standalone OS window
    // (useTauriChatWindow), not child webviews. Tear down any child webview so
    // the two views never coexist. The split↔floating transition recreates
    // the webview, so conversation state is lost on that switch (by design).
    if (mode === 'floating') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      appliedRef.current = null
      urlRef.current = null
      hiddenRef.current = false
      invoke('close_ai_chat_webview', { label }).catch(() => {})
      return
    }

    // Column has no URL (panel closed the service): tear down any lingering
    // webview so it cannot float over the panel.
    if (!url) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (urlRef.current !== null) {
        urlRef.current = null
        appliedRef.current = null
        hiddenRef.current = false
        invoke('close_ai_chat_webview', { label }).catch(() => {})
      }
      return
    }

    // Split / browser-floating — panel is visible, sync bounds now and on
    // resize/layout changes.
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
  }, [mode, url, label, schedule, contentRef, layoutKey, hidden])

  // Per-panel zoom: apply the native zoom to THIS webview only whenever the
  // panel's zoom changes (each chat scales independently — the Rust command
  // now takes a label instead of applying to every webview).
  useEffect(() => {
    if (!isTauri()) return
    invoke('set_ai_chat_webview_zoom', { label, scale }).catch(() => {})
  }, [label, scale])

  // Close the webview when the component unmounts.
  useEffect(() => {
    return () => {
      if (!isTauri()) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      appliedRef.current = null
      urlRef.current = null
      invoke('close_ai_chat_webview', { label }).catch(() => {})
    }
  }, [label])
}

/**
 * Sync ONE AI chat child webview per panel instance with its React placeholder
 * element. The label (`ai-chat-{panel.id}`) keeps every panel's webview
 * independent in the native layer, so multiple chats can coexist (several
 * docked panes + floating windows).
 */
export function useTauriChatWebview(
  panel: ChatPanelState,
  contentRef: React.RefObject<HTMLElement | null>,
  layoutKey?: string,
  hidden = false,
) {
  // Final zoom = global UI zoom × this panel's own zoom (the native webview
  // is already sized at the globally-scaled visual rect; its native zoom must
  // be the combined scale so the page renders at the same visual size as the
  // CSS-zoomed React UI around it).
  const uiZoom = useZoomScale()
  useChatWebview(
    panel.mode,
    panel.currentUrl,
    `ai-chat-${panel.id}`,
    contentRef,
    layoutKey ?? panel.dockDirection,
    hidden,
    uiZoom * panel.zoom,
  )
}
