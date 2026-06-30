import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  MessageSquare, Minus, Maximize2, X, ExternalLink,
  Copy, Check, ChevronDown, GripHorizontal,
} from 'lucide-react'
import { useQAPanel } from './useQAPanel'
import { useAIServices } from '../src/hooks/useAIServices'
import { ServiceIcon } from '../src/components/SelectionToolbar'

// --- Split mode detection (reads data-split from Layout root) ---

function useSplitModeDetect() {
  const [split, setSplit] = useState(() => {
    const root = document.querySelector('[data-split]')
    return root?.getAttribute('data-split') === 'true'
  })

  useEffect(() => {
    const root = document.querySelector('[data-split]')
    if (!root) return

    const observer = new MutationObserver(() => {
      setSplit(root.getAttribute('data-split') === 'true')
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-split'] })
    return () => observer.disconnect()
  }, [])

  return split
}

// --- Text selection detection ---

function useTextSelection() {
  const [text, setText] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleSelection = useCallback(() => {
    clearTimeout(hideTimer.current)
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    const t = sel.toString().trim()
    if (!t) return
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    setText(t)
    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('keyup', handleSelection)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('keyup', handleSelection)
    }
  }, [handleSelection])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // Don't hide if clicking inside our overlay
      const target = e.target as HTMLElement
      if (target.closest('[data-pake-overlay]')) return
      hideTimer.current = setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setText('')
          setPos(null)
        }
      }, 150)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const dismiss = useCallback(() => {
    setText('')
    setPos(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  return { text, pos, dismiss }
}

// --- Draggable hook ---

function useDraggable(
  elRef: React.RefObject<HTMLDivElement | null>,
  defaultPos: { x: number; y: number },
) {
  const [pos, setPos] = useState(defaultPos)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = elRef.current
    if (!el) return
    dragging.current = true
    const rect = el.getBoundingClientRect()
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    e.preventDefault()
  }, [elRef])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offset.current.y)),
      })
    }
    const onUp = () => { dragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { pos, onMouseDown }
}

// --- Component ---

export function PakeOverlay() {
  const isSplit = useSplitModeDetect()
  const qa = useQAPanel(isSplit)
  const { enabledServices } = useAIServices()
  const selection = useTextSelection()
  const [copied, setCopied] = useState(false)

  // Element refs for draggable panels
  const popupElRef = useRef<HTMLDivElement>(null)
  const bubbleElRef = useRef<HTMLDivElement>(null)

  // Default positions
  const popupDrag = useDraggable(popupElRef, {
    x: window.innerWidth - 400,
    y: window.innerHeight - 520,
  })
  const bubbleDrag = useDraggable(bubbleElRef, {
    x: window.innerWidth - 70,
    y: window.innerHeight - 70,
  })

  // Close on Escape
  useEffect(() => {
    if (qa.mode === 'closed') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') qa.close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [qa.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch sidebar → popup when entering split mode
  useEffect(() => {
    if (isSplit && qa.mode === 'sidebar') {
      qa.togglePopup()
    }
  }, [isSplit, qa.mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleServiceClick = useCallback((serviceId: string, serviceName: string, serviceUrl: string) => {
    qa.openSidebar(serviceId, serviceName, serviceUrl, selection.text)
    selection.dismiss()
  }, [qa, selection])

  const handleCopy = useCallback(async () => {
    if (!qa.selectedText) return
    await navigator.clipboard.writeText(qa.selectedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [qa.selectedText])

  // --- Floating service selector (appears on text selection) ---
  if (qa.mode === 'closed' && selection.pos && selection.text) {
    return createPortal(
      <div
        data-pake-overlay
        className="fixed z-[9999] pointer-events-auto"
        style={{ top: selection.pos.top, left: selection.pos.left, transform: 'translate(-50%, -100%)' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-card rounded-lg shadow-[0_2px_12px_rgba(44,40,37,0.12)] border border-border">
          <MessageSquare className="w-3.5 h-3.5 text-primary mr-1" />
          {enabledServices.map((s) => (
            <button
              key={s.id}
              onClick={() => handleServiceClick(s.id, s.name, s.url)}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-alt transition-colors"
              title={`用 ${s.name} 问答`}
            >
              <ServiceIcon service={s} className="w-5 h-5" />
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <div className="w-2 h-2 bg-surface-card border-r border-b border-border rotate-45 -mt-1" />
        </div>
      </div>,
      document.body,
    )
  }

  // --- Sidebar mode ---
  if (qa.mode === 'sidebar') {
    return createPortal(
      <div data-pake-overlay className="fixed inset-y-0 right-0 z-[9998] flex">
        {/* Backdrop */}
        <div className="flex-1 bg-black/5" onClick={qa.close} />
        {/* Panel */}
        <div className="w-[380px] bg-surface-card border-l border-border shadow-[-4px_0_24px_rgba(0,0,0,0.08)] flex flex-col pake-qa-sidebar">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-alt/50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-text truncate">{qa.serviceName}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={qa.togglePopup} className="p-1.5 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors" title="缩小为弹窗">
                <ChevronDown className="w-4 h-4" />
              </button>
              <button onClick={qa.minimize} className="p-1.5 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors" title="最小化">
                <Minus className="w-4 h-4" />
              </button>
              <button onClick={qa.close} className="p-1.5 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors" title="关闭">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Service switcher */}
          <div className="flex items-center gap-1 px-4 py-2 border-b border-border overflow-x-auto">
            {enabledServices.map((s) => (
              <button
                key={s.id}
                onClick={() => qa.openSidebar(s.id, s.name, s.url, qa.selectedText)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors shrink-0 ${
                  qa.serviceId === s.id ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-alt'
                }`}
              >
                <ServiceIcon service={s} className="w-4 h-4" />
                <span>{s.name}</span>
              </button>
            ))}
          </div>

          {/* Selected text */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-text-secondary">已选文字</span>
              <button onClick={handleCopy} className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text transition-colors">
                {copied ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <div className="text-sm text-text bg-surface-alt/60 rounded-md p-2.5 max-h-[160px] overflow-y-auto leading-relaxed">
              {qa.selectedText}
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 flex flex-col gap-2">
            <button
              onClick={qa.openServiceWindow}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              在新窗口中打开 {qa.serviceName}
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(qa.selectedText)
                qa.openServiceWindow()
              }}
              className="flex items-center justify-center gap-2 w-full py-2 text-sm text-text-secondary border border-border rounded-lg hover:bg-surface-alt transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              复制并打开
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Hint */}
          <div className="px-4 py-3 border-t border-border">
            <p className="text-[11px] text-text-secondary leading-relaxed">
              在 {qa.serviceName} 中粘贴已选文字进行提问
            </p>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  // --- Popup mode ---
  if (qa.mode === 'popup') {
    return createPortal(
      <div
        data-pake-overlay
        ref={popupElRef}
        className="fixed z-[9998] w-[360px] bg-surface-card rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col pake-qa-popup"
        style={{ left: popupDrag.pos.x, top: popupDrag.pos.y }}
      >
        {/* Header (draggable) */}
        <div
          onMouseDown={popupDrag.onMouseDown}
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-alt/50 cursor-move shrink-0"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <GripHorizontal className="w-3.5 h-3.5 text-text-secondary/50 shrink-0" />
            <ServiceIcon service={enabledServices.find((s) => s.id === qa.serviceId)!} className="w-4 h-4" />
            <span className="text-xs font-medium text-text truncate">{qa.serviceName}</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {!isSplit && (
              <button onClick={() => qa.openSidebar(qa.serviceId!, qa.serviceName, qa.serviceUrl, qa.selectedText)} className="p-1 rounded text-text-secondary hover:text-text hover:bg-surface-alt transition-colors" title="展开侧栏">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={qa.minimize} className="p-1 rounded text-text-secondary hover:text-text hover:bg-surface-alt transition-colors" title="最小化">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button onClick={qa.close} className="p-1 rounded text-text-secondary hover:text-text hover:bg-surface-alt transition-colors" title="关闭">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 flex flex-col gap-2">
          <div className="text-xs text-text-secondary">已选文字</div>
          <div className="text-sm text-text bg-surface-alt/60 rounded-md p-2 max-h-[200px] overflow-y-auto leading-relaxed">
            {qa.selectedText}
          </div>
          <button
            onClick={qa.openServiceWindow}
            className="flex items-center justify-center gap-1.5 w-full py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            打开 {qa.serviceName}
          </button>
        </div>
      </div>,
      document.body,
    )
  }

  // --- Minimized bubble ---
  if (qa.mode === 'minimized') {
    const service = enabledServices.find((s) => s.id === qa.serviceId)
    return createPortal(
      <div
        data-pake-overlay
        ref={bubbleElRef}
        className="fixed z-[9998] w-12 h-12 rounded-full bg-surface-card border border-border shadow-[0_4px_16px_rgba(0,0,0,0.12)] flex items-center justify-center cursor-pointer hover:shadow-[0_4px_20px_rgba(0,0,0,0.18)] hover:scale-105 transition-all pake-qa-bubble"
        style={{ left: bubbleDrag.pos.x, top: bubbleDrag.pos.y }}
        onMouseDown={bubbleDrag.onMouseDown}
        onClick={(e) => {
          // Only restore on click, not on drag end
          if (!e.defaultPrevented) qa.restore()
        }}
        title={`${qa.serviceName} — 点击展开`}
      >
        {service ? <ServiceIcon service={service} className="w-6 h-6" /> : <MessageSquare className="w-5 h-5 text-primary" />}
      </div>,
      document.body,
    )
  }

  return null
}
