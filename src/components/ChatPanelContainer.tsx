import type { ReactNode } from 'react'
import { useChatPanel, type ChatPanelState } from '../hooks/useChatPanel'

interface ChatPanelContainerProps {
  children: (
    openChat: (url: string, title: string) => void,
    panels: ChatPanelState[],
    resizeDock: (topId: string, bottomId: string, topRatio: number) => void,
    swapDockPanels: (idA: string, idB: string) => void,
  ) => ReactNode
}

/**
 * Owns the `useChatPanel` instance (which manages MULTIPLE panel instances —
 * one per AI service) and exposes the `openChat` callback, the full panel list
 * and the dock helpers (divider-drag resizer + adjacent-panel swapper) to its
 * children via a render prop.
 *
 * The panels themselves (header + iframe/webview) are rendered by App.tsx by
 * mapping over the list, so this container stays a thin state provider — no
 * Tauri coupling, works identically in browser and desktop builds.
 */
export function ChatPanelContainer({ children }: ChatPanelContainerProps) {
  const { openChat, panels, resizeDock, swapDockPanels } = useChatPanel()
  return <>{children(openChat, panels, resizeDock, swapDockPanels)}</>
}
