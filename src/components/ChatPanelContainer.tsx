import { lazy, Suspense } from 'react'
import { isTauri } from '../utils/tauri'
import { useChatPanel } from '../hooks/useChatPanelTauri'
import type { ReactNode } from 'react'

// Lazy load the Tauri-side chrome (divider + restore bubble).
const ChatPanelTauri = lazy(() =>
  import('./ChatPanelTauri').then((m) => ({ default: m.ChatPanel }))
)

interface ChatPanelContainerProps {
  children: (openChat: (url: string, title: string) => void) => ReactNode
}

/**
 * Container that provides Tauri chat panel integration.
 * In browser mode, children receive a no-op openChat function.
 * In Tauri mode, a single useChatPanel() instance owns all chat state and
 * children receive panel.openChat (routes through the state machine, not a
 * direct invoke bypass).
 */
export function ChatPanelContainer({ children }: ChatPanelContainerProps) {
  if (!isTauri()) {
    // Browser mode: no-op
    return <>{children(() => {})}</>
  }

  // Tauri mode: the hook is called only here (after the browser-mode early
  // return), so its invoke/listen calls never fire in a browser environment.
  return (
    <Suspense fallback={null}>
      <TauriChatPanel>{children}</TauriChatPanel>
    </Suspense>
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
