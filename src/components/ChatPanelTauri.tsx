import { useChatPanel } from '../hooks/useChatPanelTauri'

// --- Floating bubble ---
function ChatBubble({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 shadow-lg flex items-center justify-center cursor-pointer hover:bg-blue-700 hover:scale-105 transition-all z-[9999]"
      onClick={onClick}
      title="打开 AI Chat"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    </div>
  )
}

// --- Main ChatPanel component ---
export function ChatPanel() {
  const panel = useChatPanel()

  // --- Closed: show open button ---
  if (panel.mode === 'closed') {
    return (
      <button
        onClick={() => panel.openSidebar()}
        className="fixed bottom-6 right-6 px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg flex items-center gap-2 hover:bg-blue-700 transition-all z-[9999]"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-sm font-medium">AI Chat</span>
      </button>
    )
  }

  // --- Sidebar mode: show control bar ---
  if (panel.mode === 'sidebar') {
    return (
      <div className="fixed top-0 right-0 z-[9999] flex items-center gap-1 px-2 py-1 bg-gray-900/90 backdrop-blur-sm rounded-bl-lg shadow-md">
        <span className="text-xs text-white/80 mr-2">{panel.currentTitle || 'AI Chat'}</span>
        <button
          onClick={panel.togglePopup}
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title="弹出为独立窗口"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
        <button
          onClick={panel.minimize}
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title="最小化"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={panel.close}
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title="关闭"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // --- Popup mode: show control bar ---
  if (panel.mode === 'popup') {
    return (
      <div className="fixed top-0 right-0 z-[9999] flex items-center gap-1 px-2 py-1 bg-gray-900/90 backdrop-blur-sm rounded-bl-lg shadow-md">
        <span className="text-xs text-white/80 mr-2">{panel.currentTitle || 'AI Chat'} (独立窗口)</span>
        <button
          onClick={panel.togglePopup}
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title="切换为侧栏"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={panel.minimize}
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title="最小化"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={panel.close}
          className="p-1.5 rounded text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          title="关闭"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  // --- Minimized: show bubble ---
  return <ChatBubble onClick={panel.restore} />
}
