import type { ReactNode } from 'react'
import { useChatPanel, type ChatPanelState } from '../hooks/useChatPanel'

interface ChatPanelContainerProps {
  children: (openChat: (url: string, title: string) => void, panel: ChatPanelState) => ReactNode
}

/**
 * Owns the single `useChatPanel` instance and exposes both the `openChat`
 * callback and the full panel state to its children via a render prop.
 *
 * The panel itself (header + iframe) is rendered by App.tsx based on
 * `panel.mode`, so this container stays a thin state provider — no Tauri
 * coupling, works identically in browser and desktop builds.
 */
export function ChatPanelContainer({ children }: ChatPanelContainerProps) {
  const panel = useChatPanel()
  return <>{children(panel.openChat, panel)}</>
}
