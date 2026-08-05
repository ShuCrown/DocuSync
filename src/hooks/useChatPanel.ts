import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Web-based chat panel state — uniform across browser and Tauri.
 *
 * Modes:
 *   - closed    chat panel hidden, no restore bubble
 *   - split     chat panel docked on the right with a draggable divider
 *   - floating  chat panel as an in-window draggable overlay
 *   - collapsed chat panel hidden, a restore bubble is shown
 *
 * Layout prefs (split width / floating rect / last mode) persist to
 * localStorage so the user gets the same arrangement across sessions.
 */

export type ChatPanelMode = 'closed' | 'split' | 'floating' | 'collapsed'
export type ChatPanelLastMode = 'split' | 'floating'

export interface FloatingRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ChatPanelState {
  mode: ChatPanelMode
  currentUrl: string | null
  currentTitle: string | null
  splitWidth: number
  floatingRect: FloatingRect
  openChat: (url: string, title: string) => void
  switchToSplit: () => void
  switchToFloating: () => void
  collapse: () => void
  restore: () => void
  close: () => void
  setSplitWidth: (width: number) => void
  setFloatingRect: (rect: FloatingRect) => void
}

const SPLIT_MIN = 300
const SPLIT_MAX = 720
const SPLIT_DEFAULT = 420

const FLOAT_DEFAULT: FloatingRect = { x: 0, y: 0, width: 380, height: 560 }

const LS_SPLIT_WIDTH = 'docusync.chatpanel.splitWidth'
const LS_FLOATING_RECT = 'docusync.chatpanel.floatingRect'
const LS_LAST_MODE = 'docusync.chatpanel.lastMode'

function readSplitWidth(): number {
  const v = Number(localStorage.getItem(LS_SPLIT_WIDTH))
  if (!Number.isFinite(v) || v <= 0) return SPLIT_DEFAULT
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, v))
}

function readFloatingRect(): FloatingRect {
  try {
    const raw = localStorage.getItem(LS_FLOATING_RECT)
    if (!raw) return { ...FLOAT_DEFAULT }
    const parsed = JSON.parse(raw) as Partial<FloatingRect>
    return {
      x: Number.isFinite(parsed.x) ? parsed.x! : FLOAT_DEFAULT.x,
      y: Number.isFinite(parsed.y) ? parsed.y! : FLOAT_DEFAULT.y,
      width: Number.isFinite(parsed.width) ? parsed.width! : FLOAT_DEFAULT.width,
      height: Number.isFinite(parsed.height) ? parsed.height! : FLOAT_DEFAULT.height,
    }
  } catch {
    return { ...FLOAT_DEFAULT }
  }
}

function readLastMode(): ChatPanelLastMode {
  return localStorage.getItem(LS_LAST_MODE) === 'floating' ? 'floating' : 'split'
}

function clampSplit(width: number): number {
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, width))
}

export const CHAT_PANEL_SPLIT_MIN = SPLIT_MIN
export const CHAT_PANEL_SPLIT_MAX = SPLIT_MAX

export function useChatPanel(): ChatPanelState {
  const [mode, setMode] = useState<ChatPanelMode>('closed')
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [currentTitle, setCurrentTitle] = useState<string | null>(null)
  const [splitWidth, setSplitWidthState] = useState<number>(readSplitWidth)
  const [floatingRect, setFloatingRectState] = useState<FloatingRect>(readFloatingRect)
  const lastModeRef = useRef<ChatPanelLastMode>(readLastMode())

  const persistSplitWidth = useCallback((w: number) => {
    try { localStorage.setItem(LS_SPLIT_WIDTH, String(Math.round(w))) } catch { /* ignore */ }
  }, [])

  const persistFloatingRect = useCallback((r: FloatingRect) => {
    try { localStorage.setItem(LS_FLOATING_RECT, JSON.stringify(r)) } catch { /* ignore */ }
  }, [])

  const persistLastMode = useCallback((m: ChatPanelLastMode) => {
    try { localStorage.setItem(LS_LAST_MODE, m) } catch { /* ignore */ }
  }, [])

  const switchToSplit = useCallback(() => {
    lastModeRef.current = 'split'
    persistLastMode('split')
    setMode('split')
  }, [persistLastMode])

  const switchToFloating = useCallback(() => {
    lastModeRef.current = 'floating'
    persistLastMode('floating')
    setMode('floating')
  }, [persistLastMode])

  const collapse = useCallback(() => {
    setMode('collapsed')
  }, [])

  const restore = useCallback(() => {
    setMode(lastModeRef.current)
  }, [])

  const close = useCallback(() => {
    setMode('closed')
    setCurrentUrl(null)
    setCurrentTitle(null)
  }, [])

  // Open chat: if currently closed/collapsed, restore to the last layout mode
  // (default split). If already visible, keep the current layout and just swap
  // the URL/title so users can switch AI services without losing their arrangement.
  const openChat = useCallback((url: string, title: string) => {
    setCurrentUrl(url)
    setCurrentTitle(title)
    setMode((prev) => {
      if (prev === 'split' || prev === 'floating') return prev
      return lastModeRef.current
    })
  }, [])

  const setSplitWidth = useCallback((width: number) => {
    const clamped = clampSplit(width)
    setSplitWidthState(clamped)
    persistSplitWidth(clamped)
  }, [persistSplitWidth])

  const setFloatingRect = useCallback((rect: FloatingRect) => {
    setFloatingRectState(rect)
    persistFloatingRect(rect)
  }, [persistFloatingRect])

  // Keep the floating panel inside the viewport when the window resizes.
  useEffect(() => {
    if (mode !== 'floating') return
    const onResize = () => {
      setFloatingRectState((prev) => {
        const maxX = Math.max(0, window.innerWidth - prev.width)
        const maxY = Math.max(0, window.innerHeight - prev.height)
        const next = {
          ...prev,
          x: Math.min(prev.x, maxX),
          y: Math.min(prev.y, maxY),
        }
        persistFloatingRect(next)
        return next
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [mode, persistFloatingRect])

  return {
    mode,
    currentUrl,
    currentTitle,
    splitWidth,
    floatingRect,
    openChat,
    switchToSplit,
    switchToFloating,
    collapse,
    restore,
    close,
    setSplitWidth,
    setFloatingRect,
  }
}
