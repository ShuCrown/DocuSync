import { useState, useCallback, useEffect } from 'react'

export type WebChatPanelMode = 'closed' | 'sidebar' | 'popup' | 'minimized'
export type WebChatPanelLastMode = 'sidebar' | 'popup'

export interface WebChatPanelState {
  mode: WebChatPanelMode
  sidebarWidth: number
  popupX: number
  popupY: number
  popupWidth: number
  popupHeight: number
  currentUrl: string | null
  currentTitle: string | null
  openChat: (url: string, title: string) => void
  switchToPopup: () => void
  switchToSidebar: () => void
  minimize: () => void
  restore: () => void
  close: () => void
  resizeSidebar: (width: number) => void
  movePopup: (x: number, y: number) => void
  resizePopup: (width: number, height: number) => void
}

const SIDEBAR_DEFAULT_WIDTH = 420
const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 800
const POPUP_DEFAULT_WIDTH = 400
const POPUP_DEFAULT_HEIGHT = 580

const LS_WIDTH = 'docusync.webchat.width'

function readWidth(): number {
  const v = Number(localStorage.getItem(LS_WIDTH))
  if (!Number.isFinite(v) || v <= 0) return SIDEBAR_DEFAULT_WIDTH
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, v))
}

function initialPopupGeometry() {
  return {
    x: Math.max(0, window.innerWidth - POPUP_DEFAULT_WIDTH - 24),
    y: Math.max(0, window.innerHeight - POPUP_DEFAULT_HEIGHT - 24),
    w: POPUP_DEFAULT_WIDTH,
    h: POPUP_DEFAULT_HEIGHT,
  }
}

export function useWebChatPanel(): WebChatPanelState {
  const [mode, setMode] = useState<WebChatPanelMode>('closed')
  const [sidebarWidth, setSidebarWidth] = useState<number>(readWidth)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [currentTitle, setCurrentTitle] = useState<string | null>(null)
  const [lastMode, setLastMode] = useState<WebChatPanelLastMode>('sidebar')
  const [popupGeometry, setPopupGeometry] = useState(initialPopupGeometry)

  const persistWidth = useCallback((w: number) => {
    try { localStorage.setItem(LS_WIDTH, String(Math.round(w))) } catch { /* ignore */ }
  }, [])

  const openChat = useCallback((url: string, title: string) => {
    setCurrentUrl(url)
    setCurrentTitle(title)
    setLastMode('sidebar')
    setMode('sidebar')
  }, [])

  const switchToSidebar = useCallback(() => {
    setLastMode('sidebar')
    setMode('sidebar')
  }, [])

  const switchToPopup = useCallback(() => {
    setLastMode('popup')
    setMode('popup')
  }, [])

  const minimize = useCallback(() => {
    setMode('minimized')
  }, [])

  const restore = useCallback(() => {
    setMode(lastMode)
  }, [lastMode])

  const close = useCallback(() => {
    setMode('closed')
  }, [])

  const resizeSidebar = useCallback((width: number) => {
    const clamped = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width))
    setSidebarWidth(clamped)
    persistWidth(clamped)
  }, [persistWidth])

  const movePopup = useCallback((x: number, y: number) => {
    setPopupGeometry((g) => ({ ...g, x: Math.max(0, x), y: Math.max(0, y) }))
  }, [])

  const resizePopup = useCallback((width: number, height: number) => {
    setPopupGeometry((g) => ({ ...g, w: Math.max(280, width), h: Math.max(360, height) }))
  }, [])

  // Keep the popup within the viewport when the window resizes.
  useEffect(() => {
    const onResize = () => {
      setPopupGeometry((g) => ({
        ...g,
        x: Math.max(0, Math.min(g.x, window.innerWidth - g.w)),
        y: Math.max(0, Math.min(g.y, window.innerHeight - g.h)),
      }))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return {
    mode,
    sidebarWidth,
    popupX: popupGeometry.x,
    popupY: popupGeometry.y,
    popupWidth: popupGeometry.w,
    popupHeight: popupGeometry.h,
    currentUrl,
    currentTitle,
    openChat,
    switchToPopup,
    switchToSidebar,
    minimize,
    restore,
    close,
    resizeSidebar,
    movePopup,
    resizePopup,
  }
}
