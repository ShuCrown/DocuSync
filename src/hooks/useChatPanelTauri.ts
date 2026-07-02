import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export type ChatPanelMode = 'closed' | 'sidebar' | 'popup' | 'minimized'

export interface ChatPanelState {
  mode: ChatPanelMode
  sidebarWidth: number
  currentUrl: string | null
  currentTitle: string | null
  openSidebar: (url?: string, title?: string) => void
  closeSidebar: () => void
  togglePopup: () => void
  minimize: () => void
  restore: () => void
  close: () => void
  resizeSidebar: (width: number) => void
}

const SIDEBAR_DEFAULT_WIDTH = 400
const SIDEBAR_MIN_WIDTH = 300
const SIDEBAR_MAX_WIDTH = 600

export function useChatPanel(): ChatPanelState {
  const [mode, setMode] = useState<ChatPanelMode>('closed')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const [currentTitle, setCurrentTitle] = useState<string | null>(null)

  // Listen for Tauri events from the initialization script
  useEffect(() => {
    const unlistenOpened = listen('ai-chat-opened', () => {
      setMode('sidebar')
    })

    const unlistenClosed = listen('ai-chat-closed', () => {
      setMode('closed')
      setCurrentUrl(null)
      setCurrentTitle(null)
    })

    return () => {
      unlistenOpened.then((fn: () => void) => fn())
      unlistenClosed.then((fn: () => void) => fn())
    }
  }, [])

  const openSidebar = useCallback(async (url?: string, title?: string) => {
    try {
      const targetUrl = url || currentUrl || 'https://chat.deepseek.com/'
      const targetTitle = title || currentTitle || 'AI Chat'

      setCurrentUrl(targetUrl)
      setCurrentTitle(targetTitle)

      // Call Tauri command to open AI chat webview
      await invoke('open_ai_chat', {
        url: targetUrl,
        title: targetTitle,
      })

      setMode('sidebar')
    } catch (err) {
      console.error('Failed to open sidebar:', err)
    }
  }, [currentUrl, currentTitle])

  const closeSidebar = useCallback(async () => {
    try {
      await invoke('close_ai_chat')
      setMode('closed')
      setCurrentUrl(null)
      setCurrentTitle(null)
    } catch (err) {
      console.error('Failed to close sidebar:', err)
    }
  }, [])

  const togglePopup = useCallback(async () => {
    if (mode === 'sidebar') {
      // Switch to popup: hide sidebar, create floating window
      try {
        await invoke('close_ai_chat')

        // Create floating window
        const width = 460
        const height = 640
        const x = screen.availWidth - width - 20
        const y = 80

        await invoke('create_floating_window', {
          label: 'ai-chat-float',
          url: currentUrl || 'https://chat.deepseek.com/',
          title: currentTitle || 'AI Chat',
          width,
          height,
          x,
          y,
        })

        setMode('popup')
      } catch (err) {
        console.error('Failed to toggle popup:', err)
      }
    } else if (mode === 'popup') {
      // Switch back to sidebar
      try {
        await invoke('close_webview', { label: 'ai-chat-float' })
        await openSidebar()
      } catch (err) {
        console.error('Failed to switch to sidebar:', err)
      }
    }
  }, [mode, openSidebar, currentUrl, currentTitle])

  const minimize = useCallback(async () => {
    try {
      if (mode === 'sidebar') {
        await invoke('close_ai_chat')
      } else if (mode === 'popup') {
        await invoke('close_webview', { label: 'ai-chat-float' })
      }
      setMode('minimized')
    } catch (err) {
      console.error('Failed to minimize:', err)
    }
  }, [mode])

  const restore = useCallback(async () => {
    if (mode === 'minimized') {
      await openSidebar()
    }
  }, [mode, openSidebar])

  const close = useCallback(async () => {
    try {
      if (mode === 'sidebar') {
        await invoke('close_ai_chat')
      } else if (mode === 'popup') {
        await invoke('close_webview', { label: 'ai-chat-float' })
      }
      setMode('closed')
      setCurrentUrl(null)
      setCurrentTitle(null)
    } catch (err) {
      console.error('Failed to close:', err)
    }
  }, [mode])

  const resizeSidebar = useCallback(async (newWidth: number) => {
    const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth))
    setSidebarWidth(clampedWidth)

    try {
      const mainWidth = window.innerWidth - clampedWidth
      await invoke('resize_webview', { label: 'docusync', width: mainWidth, height: window.innerHeight })
      await invoke('move_webview', { label: 'ai-chat', x: mainWidth, y: 0 })
      await invoke('resize_webview', { label: 'ai-chat', width: clampedWidth, height: window.innerHeight })
    } catch (err) {
      console.error('Failed to resize sidebar:', err)
    }
  }, [])

  return {
    mode,
    sidebarWidth,
    currentUrl,
    currentTitle,
    openSidebar,
    closeSidebar,
    togglePopup,
    minimize,
    restore,
    close,
    resizeSidebar,
  }
}
