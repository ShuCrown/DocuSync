import { useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauri'
import type { ChatPanelState } from './useChatPanel'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

function readBounds(el: HTMLElement): Bounds {
  const r = el.getBoundingClientRect()
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
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
        console.log('[useTauriChatWebview] CREATE webview, url:', url)
        await invoke('create_ai_chat_webview', { url, bounds })
        hiddenRef.current = false
      } else if (hiddenRef.current) {
        console.log('[useTauriChatWebview] SHOW hidden webview, bounds:', bounds)
        await invoke('show_ai_chat_webview', { bounds })
        hiddenRef.current = false
      } else {
        console.log('[useTauriChatWebview] UPDATE webview, bounds:', bounds)
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
    console.log('[useTauriChatWebview] effect fired, mode:', panel.mode, 'urlRef:', urlRef.current, 'hiddenRef:', hiddenRef.current)

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
