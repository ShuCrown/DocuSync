import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Multi-instance chat panel state — uniform across browser and Tauri.
 *
 * Each AI service opened via the selection toolbar becomes its own panel
 * instance ("open one window per service"):
 *   - Same service clicked again → that panel is restored/focused (reuse).
 *   - A different service → a NEW panel instance is created.
 *
 * Modes per instance:
 *   - closed    panel hidden, no restore bubble
 *   - split     panel docked on the right. MULTIPLE panels may be docked at
 *               once and are ALL visible at the same time, stacked vertically
 *               like document split panes (each holds a `dockRatio` share of
 *               the docked column; a draggable divider between panels resizes
 *               them). Ratios are normalized (equal) whenever the docked set
 *               changes.
 *   - floating  panel as an in-window overlay / standalone OS window (Tauri)
 *   - collapsed panel hidden, a restore bubble is shown
 *
 * Layout prefs persist to localStorage: split width (global), per-panel
 * floating rect (keyed by panel id) and the last used mode.
 */

export type ChatPanelMode = 'closed' | 'split' | 'floating' | 'collapsed'
export type ChatPanelLastMode = 'split' | 'floating'
/** Direction of the docked (split) panes inside the sidebar. */
export type ChatDockDirection = 'vertical' | 'horizontal'

export interface FloatingRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ChatPanelState {
  /** Unique instance id — also used for native webview/window labels. */
  id: string
  mode: ChatPanelMode
  currentUrl: string | null
  currentTitle: string | null
  /** Height/width share of the docked column (0..1) when this panel is docked
   * in split mode. Only meaningful for split panels; ratios across all docked
   * panels sum to 1. Applies to the height axis in vertical mode and the width
   * axis in horizontal mode. */
  dockRatio: number
  /** Layout direction of the docked panes (shared by every panel). */
  dockDirection: ChatDockDirection
  splitWidth: number
  floatingRect: FloatingRect
  switchToSplit: () => void
  switchToFloating: () => void
  collapse: () => void
  restore: () => void
  close: () => void
  setSplitWidth: (width: number) => void
  setFloatingRect: (rect: FloatingRect) => void
  toggleDockDirection: () => void
}

export interface ChatPanelsState {
  panels: ChatPanelState[]
  openChat: (url: string, title: string) => void
  /**
   * Resize two adjacent docked panels via a divider drag: `topId` gets
   * `topRatio` of the docked column, `bottomId` gets the rest.
   */
  resizeDock: (topId: string, bottomId: string, topRatio: number) => void
}

interface PanelData {
  id: string
  mode: ChatPanelMode
  url: string | null
  title: string | null
  rect: FloatingRect
  dockRatio: number
}

const SPLIT_MIN = 300
const SPLIT_MAX = 720
const SPLIT_DEFAULT = 420

const FLOAT_MIN_WIDTH = 280
const FLOAT_MIN_HEIGHT = 320
const FLOAT_MAX_WIDTH = 800
const FLOAT_MAX_HEIGHT = 900

const FLOAT_DEFAULT: FloatingRect = { x: 40, y: 40, width: 380, height: 560 }
/** Cascade offset applied to each newly opened floating panel. */
const FLOAT_CASCADE_STEP = 32

/** Minimum share a docked panel can be resized to (divider drag). */
const DOCK_MIN_RATIO = 0.15

const LS_SPLIT_WIDTH = 'docusync.chatpanel.splitWidth'
const LS_LAST_MODE = 'docusync.chatpanel.lastMode'
const LS_FLOAT_RECT_PREFIX = 'docusync.chatpanel.floatingRect.'
const LS_DOCK_DIRECTION = 'docusync.chatpanel.dockDirection'

function readDockDirection(): ChatDockDirection {
  return localStorage.getItem(LS_DOCK_DIRECTION) === 'horizontal' ? 'horizontal' : 'vertical'
}

function readSplitWidth(): number {
  const v = Number(localStorage.getItem(LS_SPLIT_WIDTH))
  if (!Number.isFinite(v) || v <= 0) return SPLIT_DEFAULT
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, v))
}

function readLastMode(): ChatPanelLastMode {
  return localStorage.getItem(LS_LAST_MODE) === 'floating' ? 'floating' : 'split'
}

function clampSplit(width: number): number {
  return Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, width))
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Re-split the docked (split-mode) panels into equal height shares. Called
 * whenever the set of docked panels changes so new/removed panels never leave
 * stale ratios (a divider drag is preserved by `resizeDock` instead).
 */
function normalizeDockRatios(data: PanelData[]): PanelData[] {
  const splitIds = data.filter((p) => p.mode === 'split').map((p) => p.id)
  if (splitIds.length === 0) return data
  const ratio = 1 / splitIds.length
  return data.map((p) => (splitIds.includes(p.id) ? { ...p, dockRatio: ratio } : p))
}

/** Pure transition: set panel `id` to `target` mode, then re-normalize dock. */
function applyMode(data: PanelData[], id: string, target: ChatPanelMode): PanelData[] {
  const next = data.map((p) => (p.id === id ? { ...p, mode: target } : p))
  return normalizeDockRatios(next)
}

export const CHAT_PANEL_SPLIT_MIN = SPLIT_MIN
export const CHAT_PANEL_SPLIT_MAX = SPLIT_MAX
export const CHAT_PANEL_FLOAT_MIN_WIDTH = FLOAT_MIN_WIDTH
export const CHAT_PANEL_FLOAT_MIN_HEIGHT = FLOAT_MIN_HEIGHT
export const CHAT_PANEL_FLOAT_MAX_WIDTH = FLOAT_MAX_WIDTH
export const CHAT_PANEL_FLOAT_MAX_HEIGHT = FLOAT_MAX_HEIGHT

export function useChatPanel(): ChatPanelsState {
  const [data, setData] = useState<PanelData[]>([])
  const [splitWidth, setSplitWidthState] = useState<number>(readSplitWidth)
  const [dockDirection, setDockDirection] = useState<ChatDockDirection>(readDockDirection)
  const lastModeRef = useRef<ChatPanelLastMode>(readLastMode())

  const persistSplitWidth = useCallback((w: number) => {
    try { localStorage.setItem(LS_SPLIT_WIDTH, String(Math.round(w))) } catch { /* ignore */ }
  }, [])

  const persistLastMode = useCallback((m: ChatPanelLastMode) => {
    try { localStorage.setItem(LS_LAST_MODE, m) } catch { /* ignore */ }
  }, [])

  const persistRect = useCallback((id: string, r: FloatingRect) => {
    try { localStorage.setItem(LS_FLOAT_RECT_PREFIX + id, JSON.stringify(r)) } catch { /* ignore */ }
  }, [])

  // Flip the docked panes between vertical (stacked) and horizontal (side by
  // side) layout. Ratios are re-normalized so each pane gets an equal share.
  const toggleDockDirection = useCallback(() => {
    setDockDirection((prev) => {
      const next: ChatDockDirection = prev === 'vertical' ? 'horizontal' : 'vertical'
      try { localStorage.setItem(LS_DOCK_DIRECTION, next) } catch { /* ignore */ }
      return next
    })
    setData((d) => normalizeDockRatios(d))
  }, [])

  // Set one panel's mode. `null` means "restore to the last used mode".
  const setPanelMode = useCallback((id: string, mode: ChatPanelMode | null) => {
    const target = mode ?? lastModeRef.current
    if (mode === 'split') {
      lastModeRef.current = 'split'
      persistLastMode('split')
    } else if (mode === 'floating') {
      lastModeRef.current = 'floating'
      persistLastMode('floating')
    }
    setData((prev) => applyMode(prev, id, target))
  }, [persistLastMode])

  const removePanel = useCallback((id: string) => {
    setData((prev) => normalizeDockRatios(prev.filter((p) => p.id !== id)))
  }, [])

  const updateRect = useCallback((id: string, r: FloatingRect) => {
    setData((prev) => prev.map((p) => (p.id === id ? { ...p, rect: r } : p)))
    persistRect(id, r)
  }, [persistRect])

  // Divider drag between two ADJACENT docked panels: the dragged panel's
  // change is taken from its immediate neighbor (sum preserved), so panels
  // further away keep their current share. This keeps all ratios summing to 1
  // no matter how many panels are docked.
  const resizeDock = useCallback((topId: string, bottomId: string, topRatio: number) => {
    setData((prev) => {
      const top = prev.find((p) => p.id === topId)
      const bottom = prev.find((p) => p.id === bottomId)
      if (!top || !bottom) return prev
      const pairTotal = top.dockRatio + bottom.dockRatio
      const upper = Math.max(DOCK_MIN_RATIO, pairTotal - DOCK_MIN_RATIO)
      const clamped = Math.max(DOCK_MIN_RATIO, Math.min(upper, topRatio))
      return prev.map((p) => {
        if (p.id === topId) return { ...p, dockRatio: clamped }
        if (p.id === bottomId) return { ...p, dockRatio: Math.max(0, pairTotal - clamped) }
        return p
      })
    })
  }, [])

  // Open chat: reuse the panel already hosting this service (restore/focus it),
  // otherwise create a NEW panel. New panels inherit the last used layout, so
  // they can dock directly into the sidebar alongside existing panels.
  const openChat = useCallback((url: string, title: string) => {
    setData((prev) => {
      const existing = prev.find((p) => p.url === url)
      if (existing) {
        const target = existing.mode === 'collapsed' || existing.mode === 'closed'
          ? lastModeRef.current
          : existing.mode
        return applyMode(prev, existing.id, target)
      }
      const initialMode: ChatPanelMode = lastModeRef.current
      const offset = prev.length * FLOAT_CASCADE_STEP
      const rect = { ...FLOAT_DEFAULT, x: FLOAT_DEFAULT.x + offset, y: FLOAT_DEFAULT.y + offset }
      return normalizeDockRatios([
        ...prev,
        { id: genId(), mode: initialMode, url, title, rect, dockRatio: 1 },
      ])
    })
  }, [])

  const setSplitWidth = useCallback((width: number) => {
    const clamped = clampSplit(width)
    setSplitWidthState(clamped)
    persistSplitWidth(clamped)
  }, [persistSplitWidth])

  // Keep every floating panel inside the viewport when the window resizes.
  useEffect(() => {
    const onResize = () => {
      setData((prev) =>
        prev.map((p) => {
          if (p.mode !== 'floating') return p
          const maxX = Math.max(0, window.innerWidth - p.rect.width)
          const maxY = Math.max(0, window.innerHeight - p.rect.height)
          const next = { ...p.rect, x: Math.min(p.rect.x, maxX), y: Math.min(p.rect.y, maxY) }
          if (next.x === p.rect.x && next.y === p.rect.y) return p
          persistRect(p.id, next)
          return { ...p, rect: next }
        }),
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [persistRect])

  const panels: ChatPanelState[] = data.map((p) => ({
    id: p.id,
    mode: p.mode,
    currentUrl: p.url,
    currentTitle: p.title,
    dockRatio: p.dockRatio,
    dockDirection,
    splitWidth,
    floatingRect: p.rect,
    switchToSplit: () => setPanelMode(p.id, 'split'),
    switchToFloating: () => setPanelMode(p.id, 'floating'),
    collapse: () => setPanelMode(p.id, 'collapsed'),
    restore: () => setPanelMode(p.id, null),
    close: () => removePanel(p.id),
    setSplitWidth,
    setFloatingRect: (r) => updateRect(p.id, r),
    toggleDockDirection,
  }))

  return { panels, openChat, resizeDock }
}
