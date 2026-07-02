import { useState, useCallback, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ChatPanelMode = 'closed' | 'sidebar' | 'popup' | 'minimized'
export type ChatPanelLastMode = 'sidebar' | 'popup'

export interface ChatPanelState {
  mode: ChatPanelMode
  sidebarWidth: number
  currentUrl: string | null
  currentTitle: string | null
  openSidebar: (url?: string, title?: string) => void
  closeSidebar: () => void
  switchToPopup: () => void
  switchToSidebar: () => void
  minimize: () => void
  restore: () => void
  close: () => void
  resizeSidebar: (width: number) => void
  /** Alias used by the container contract (text-selection → open chat). */
  openChat: (url: string, title: string) => void
}

const SIDEBAR_DEFAULT_WIDTH = 400
const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 600
const POPUP_DEFAULT_WIDTH = 380
const POPUP_DEFAULT_HEIGHT = 560

const LS_WIDTH = 'docusync.chatpanel.width'
const LS_LAST_MODE = 'docusync.chatpanel.lastMode'

function readWidth(): number {
  const v = Number(localStorage.getItem(LS_WIDTH))
  if (!Number.isFinite(v) || v <= 0) return SIDEBAR_DEFAULT_WIDTH
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, v))
}

function readLastMode(): ChatPanelLastMode {
  const v = localStorage.getItem(LS_LAST_MODE)
  return v === 'popup' ? 'popup' : 'sidebar'
}

export function useChatPanel(): ChatPanelState {
  const [mode, setMode] = useState<ChatPanelMode>('closed')
  const [sidebarWidth, setSidebarWidth] = useState<number>(readWidth)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [currentTitle, setCurrentTitle] = useState<string | null>(null)
  const lastModeRef = useRef<ChatPanelLastMode>(readLastMode())
  // Keep the latest url/title in refs so header-action dispatch (from an event listener) sees fresh values.
  const urlRef = useRef<string | null>(null)
  const titleRef = useRef<string | null>(null)

  useEffect(() => { urlRef.current = currentUrl }, [currentUrl])
  useEffect(() => { titleRef.current = currentTitle }, [currentTitle])

  const persistWidth = useCallback((w: number) => {
    try { localStorage.setItem(LS_WIDTH, String(Math.round(w))) } catch { /* ignore */ }
  }, [])

  const persistLastMode = useCallback((m: ChatPanelLastMode) => {
    try { localStorage.setItem(LS_LAST_MODE, m) } catch { /* ignore */ }
  }, [])

  const resizeSidebar = useCallback(async (newWidth: number) => {
    const clamped = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth))
    setSidebarWidth(clamped)
    persistWidth(clamped)
    try {
      // Use the sum of current docusync width + chat width as a robust fallback
      // when the Tauri main-size command is unavailable.
      let mainW = window.innerWidth + sidebarWidth
      let mainH = window.innerHeight
      try {
        const size = await invoke<[number, number]>('get_main_size')
        if (Array.isArray(size) && size.length === 2) { mainW = size[0]; mainH = size[1] }
      } catch { /* fall back to window.innerWidth + sidebarWidth */ }
      const docW = Math.max(200, mainW - clamped)
      await invoke('resize_webview', { label: 'docusync', width: docW, height: mainH })
      await invoke('move_webview', { label: 'ai-chat', x: docW, y: 0 })
      await invoke('resize_webview', { label: 'ai-chat', width: clamped, height: mainH })
    } catch (err) {
      console.error('Failed to resize sidebar:', err)
    }
  }, [persistWidth, sidebarWidth])

  const openSidebar = useCallback(async (url?: string, title?: string) => {
    const targetUrl = url || urlRef.current || 'https://chat.deepseek.com/'
    const targetTitle = title || titleRef.current || 'AI Chat'
    const width = sidebarWidth
    setCurrentUrl(targetUrl)
    setCurrentTitle(targetTitle)
    urlRef.current = targetUrl
    titleRef.current = targetTitle
    lastModeRef.current = 'sidebar'
    persistLastMode('sidebar')
    try {
      await invoke('open_ai_chat', { url: targetUrl, title: targetTitle, width })
      setMode('sidebar')
      // Sync geometry with the current persisted width in case Rust fell back to a default.
      await resizeSidebar(width)
    } catch (err) {
      console.error('Failed to open sidebar:', err)
    }
  }, [persistLastMode, sidebarWidth, resizeSidebar])

  const switchToSidebar = useCallback(async () => {
    const url = urlRef.current || 'https://chat.deepseek.com/'
    const title = titleRef.current || 'AI Chat'
    const width = sidebarWidth
    lastModeRef.current = 'sidebar'
    persistLastMode('sidebar')
    try {
      await invoke('open_ai_chat', { url, title, width })
      setMode('sidebar')
      await resizeSidebar(width)
    } catch (err) {
      console.error('Failed to switch to sidebar:', err)
    }
  }, [persistLastMode, sidebarWidth, resizeSidebar])

  const switchToPopup = useCallback(async () => {
    const url = urlRef.current || 'https://chat.deepseek.com/'
    const title = titleRef.current || 'AI Chat'
    let mainW = window.innerWidth
    let mainH = window.innerHeight
    try {
      const size = await invoke<[number, number]>('get_main_size')
      if (Array.isArray(size) && size.length === 2) { mainW = size[0]; mainH = size[1] }
    } catch { /* fall back to innerWidth/innerHeight */ }
    const w = POPUP_DEFAULT_WIDTH
    const h = POPUP_DEFAULT_HEIGHT
    const x = Math.max(0, mainW - w - 24)
    const y = Math.max(0, mainH - h - 24)
    lastModeRef.current = 'popup'
    persistLastMode('popup')
    try {
      await invoke('open_ai_chat_popup', { url, title, width: w, height: h, x, y })
      setMode('popup')
    } catch (err) {
      console.error('Failed to switch to popup:', err)
    }
  }, [persistLastMode])

  const minimize = useCallback(async () => {
    try {
      await invoke('minimize_ai_chat')
      setMode('minimized')
    } catch (err) {
      console.error('Failed to minimize:', err)
    }
  }, [])

  const restore = useCallback(async () => {
    if (lastModeRef.current === 'popup') {
      await switchToPopup()
    } else {
      await switchToSidebar()
    }
  }, [switchToPopup, switchToSidebar])

  const close = useCallback(async () => {
    try {
      await invoke('close_ai_chat')
      setMode('closed')
      setCurrentUrl(null)
      setCurrentTitle(null)
    } catch (err) {
      console.error('Failed to close:', err)
    }
  }, [])

  // Backwards-compatible alias kept in the public API.
  const closeSidebar = close

  // React to header-action events emitted by the injected AI-side header (relayed via Rust).
  useEffect(() => {
    const unlisten = listen<string>('ai-chat-header-action', (e) => {
      const action = e.payload
      if (action === 'sidebar') switchToSidebar()
      else if (action === 'popup') switchToPopup()
      else if (action === 'minimize') minimize()
      else if (action === 'close') close()
    })
    return () => { unlisten.then((fn) => fn()) }
  }, [switchToSidebar, switchToPopup, minimize, close])

  // Sync mode when Rust reports close/open externally (e.g. window.open interceptor path).
  useEffect(() => {
    const unlistenOpened = listen('ai-chat-opened', () => { setMode('sidebar') })
    const unlistenClosed = listen('ai-chat-closed', () => {
      setMode('closed')
      setCurrentUrl(null)
      setCurrentTitle(null)
    })
    return () => {
      unlistenOpened.then((fn) => fn())
      unlistenClosed.then((fn) => fn())
    }
  }, [])

  return {
    mode,
    sidebarWidth,
    currentUrl,
    currentTitle,
    openSidebar,
    closeSidebar,
    switchToPopup,
    switchToSidebar,
    minimize,
    restore,
    close,
    resizeSidebar,
    openChat: openSidebar,
  }
}
