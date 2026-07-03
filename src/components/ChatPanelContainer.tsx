import { lazy, Suspense } from 'react'
import { isTauri } from '../utils/tauri'
import { useChatPanel } from '../hooks/useChatPanelTauri'
import { useWebChatPanel } from '../hooks/useWebChatPanel'
import { WebChatPanel } from './WebChatPanel'
import type { ReactNode } from 'react'

// Lazy load the Tauri-side chrome (divider + restore bubble).
const ChatPanelTauri = lazy(() =>
  import('./ChatPanelTauri').then((m) => ({ default: m.ChatPanel }))
)

interface ChatPanelContainerProps {
  children: (openChat: (url: string, title: string) => void) => ReactNode
}

/**
 * Container that provides chat panel integration for both Tauri and browser modes.
 *
 * - Tauri mode: the native OS webview sidebar/popup is managed by useChatPanel().
 * - Browser mode: an in-app split-pane/floating panel is managed by useWebChatPanel().
 */
export function ChatPanelContainer({ children }: ChatPanelContainerProps) {
  if (!isTauri()) {
    // Browser mode: render the web-based split-pane chat panel.
    return <BrowserChatPanel>{children}</BrowserChatPanel>
  }

  // Tauri mode: the hook is called only here (after the browser-mode early
  // return), so its invoke/listen calls never fire in a browser environment.
  return (
    <Suspense fallback={null}>
      <TauriChatPanel>{children}</TauriChatPanel>
    </Suspense>
  )
}

function BrowserChatPanel({
  children,
}: {
  children: (openChat: (url: string, title: string) => void) => ReactNode
}) {
  const panel = useWebChatPanel()
  return (
    <>
      {children(panel.openChat)}
      <WebChatPanel panel={panel} />
    </>
  )
}

function TauriChatPanel({
  children,
}: {
  children: (openChat: (url: string, title: string) => void) => ReactNode
}) {
  const panel = useChatPanel()
  return (
    <>
      {children(panel.openChat)}
      <ChatPanelTauri panel={panel} />
    </>
  )
}
