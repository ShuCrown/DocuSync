import { lazy, Suspense, useCallback, useState } from 'react'
import { isTauri } from '../utils/tauri'
import type { ReactNode } from 'react'

// Lazy load Tauri-specific component
const ChatPanelTauri = lazy(() =>
  import('./ChatPanelTauri').then((m) => ({ default: m.ChatPanel }))
)

interface ChatPanelContainerProps {
  children: (openChat: (url: string, title: string) => void) => ReactNode
}

/**
 * Container that provides Tauri chat panel integration.
 * In browser mode, children receive a no-op openChat function.
 * In Tauri mode, children receive a function that opens the sidebar.
 */
export function ChatPanelContainer({ children }: ChatPanelContainerProps) {
  const [chatUrl, setChatUrl] = useState<string | null>(null)
  const [chatTitle, setChatTitle] = useState<string | null>(null)

  const handleOpenChat = useCallback((url: string, title: string) => {
    setChatUrl(url)
    setChatTitle(title)
  }, [])

  if (!isTauri()) {
    // Browser mode: no-op
    return <>{children(() => {})}</>
  }

  // Tauri mode: render chat panel with lazy-loaded components
  return (
    <Suspense fallback={null}>
      <TauriChatPanel
        chatUrl={chatUrl}
        chatTitle={chatTitle}
        onOpen={handleOpenChat}
      >
        {children}
      </TauriChatPanel>
    </Suspense>
  )
}

function TauriChatPanel({
  onOpen,
  children,
}: {
  chatUrl: string | null
  chatTitle: string | null
  onOpen: (url: string, title: string) => void
  children: (openChat: (url: string, title: string) => void) => ReactNode
}) {
  // This is a simplified version - in real Tauri, the hook would be called at component level
  // For now, we'll use a callback-based approach
  const openChat = useCallback(
    (url: string, title: string) => {
      onOpen(url, title)
      // In Tauri environment, invoke the command directly
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('open_ai_chat', { url, title })
        })
      }
    },
    [onOpen]
  )

  return (
    <>
      {children(openChat)}
      <ChatPanelTauri />
    </>
  )
}
