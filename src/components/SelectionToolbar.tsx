import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, Settings, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { useAIServices } from '../hooks/useAIServices'
import { AISettingsPanel } from './AISettingsPanel'
import type { AIService } from '../hooks/useAIServices'

// --- Icon component with fallback (exported for AISettingsPanel) ---

export function ServiceIcon({ service, className }: { service: AIService; className?: string }) {
  const [error, setError] = useState(false)

  if (error || !service.iconUrl) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm text-white text-xs font-bold ${className ?? 'w-5 h-5'}`}
        style={{ backgroundColor: service.color }}
      >
        {service.fallback}
      </span>
    )
  }

  return (
    <img
      src={service.iconUrl}
      alt={service.name}
      className={`object-contain ${className ?? 'w-5 h-5'}`}
      onError={() => setError(true)}
      draggable={false}
    />
  )
}

// --- Position (viewport coordinates for position: fixed) ---

interface Pos {
  top: number
  left: number
  placement: 'above' | 'below'
}

// --- Quick-action presets ---
// Prepend a Chinese prompt prefix to the copied text so the user only needs
// to paste into the third-party AI chat panel.

const QUICK_ACTIONS = [
  { id: 'explain', label: '解释', prefix: '请解释以下内容：\n\n' },
  { id: 'translate', label: '翻译', prefix: '请将以下内容翻译为英文：\n\n' },
  { id: 'summarize', label: '总结', prefix: '请用要点总结以下内容：\n\n' },
  { id: 'rewrite', label: '改写', prefix: '请改写以下内容，使其更清晰流畅：\n\n' },
] as const

// Rough toolbar width estimate used for horizontal clamping. The actual
// width varies with the number of enabled services, but clamping against
// this estimate keeps the toolbar comfortably inside the viewport.
const TOOLBAR_ESTIMATED_WIDTH = 280
const TOOLBAR_HEIGHT = 44
const VIEWPORT_MARGIN = 8

// --- Component ---

export function SelectionToolbar({ onOpenChat }: { onOpenChat?: (url: string, title: string) => void }) {
  const { services, enabledServices, addService, removeService, moveService, toggleService, updateService, resetToDefaults } = useAIServices()
  const [text, setText] = useState('')
  const [pos, setPos] = useState<Pos | null>(null)
  const [copied, setCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const selectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Detect text selection on mouseup / keyup. Debounced so rapid keyboard
  // selection (Shift+arrows) doesn't flicker the toolbar.
  const handleSelection = useCallback(() => {
    clearTimeout(selectTimer.current)
    selectTimer.current = setTimeout(() => {
      clearTimeout(hideTimer.current)
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return

      const t = sel.toString().trim()
      if (!t) return

      const rect = sel.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return

      // Position adaptive: prefer above; flip below if not enough headroom.
      const placement: 'above' | 'below' =
        rect.top < TOOLBAR_HEIGHT + VIEWPORT_MARGIN ? 'below' : 'above'

      // Clamp horizontal position so the toolbar stays fully on-screen.
      const viewportWidth = window.innerWidth
      const halfWidth = TOOLBAR_ESTIMATED_WIDTH / 2
      const rawLeft = rect.left + rect.width / 2
      const minLeft = halfWidth + VIEWPORT_MARGIN
      const maxLeft = viewportWidth - halfWidth - VIEWPORT_MARGIN
      const left = Math.max(minLeft, Math.min(maxLeft, rawLeft))

      const top = placement === 'above'
        ? rect.top - VIEWPORT_MARGIN
        : rect.bottom + VIEWPORT_MARGIN

      setPos({ top, left, placement })
      setText(t)
      setCopied(false)
      setExpanded(false)
    }, 80)
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('keyup', handleSelection)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('keyup', handleSelection)
      clearTimeout(selectTimer.current)
    }
  }, [handleSelection])

  // Hide when selection clears (delayed so toolbar clicks register)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return
      hideTimer.current = setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          setPos(null)
          setText('')
          setExpanded(false)
        }
      }, 150)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Esc dismisses the toolbar (the settings panel handles its own Esc).
  useEffect(() => {
    if (!pos || settingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.getSelection()?.removeAllRanges()
        setPos(null)
        setText('')
        setExpanded(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pos, settingsOpen])

  const copyToClipboard = async (content: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = content
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        return true
      } catch {
        return false
      }
    }
  }

  const flashCopied = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleCopyOnly = async () => {
    if (!text) return
    const ok = await copyToClipboard(text)
    if (ok) flashCopied()
  }

  const openService = (service: AIService) => {
    if (onOpenChat) {
      onOpenChat(service.url, service.name)
    } else {
      const w = 900, h = 700
      window.open(
        service.url,
        `ai-${service.id}`,
        `width=${w},height=${h},left=${Math.round((screen.width - w) / 2)},top=${Math.round((screen.height - h) / 2)},scrollbars=yes,resizable=yes`,
      )
    }
  }

  const handleServiceClick = async (service: AIService, prefix = '') => {
    if (!text) return
    const content = prefix + text
    await copyToClipboard(content)
    flashCopied()
    openService(service)

    window.getSelection()?.removeAllRanges()
    setPos(null)
    setText('')
    setExpanded(false)
  }

  if (!pos || !text) return null

  const transform = pos.placement === 'above'
    ? 'translate(-50%, -100%)'
    : 'translate(-50%, 0)'

  const arrowEl = (
    <div className="flex justify-center">
      <div
        className={`w-2 h-2 bg-surface-card border-border/60 rotate-45 ${
          pos.placement === 'above' ? 'border-r border-b -mt-1' : 'border-l border-t -mb-1'
        }`}
      />
    </div>
  )

  return createPortal(
    <>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="AI 问答工具栏"
        className="fixed z-[9999] pointer-events-auto"
        style={{ top: pos.top, left: pos.left, transform }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {/* When below the selection, the arrow sits on top pointing up. */}
        {pos.placement === 'below' && arrowEl}

        <div className="flex flex-col gap-1 px-2 py-1.5 bg-surface-card rounded-lg shadow-[0_4px_16px_rgba(44,40,37,0.16)] border border-border/60">
          <div className="flex items-center gap-1">
            {/* AI services — primary action: copy + open chat */}
            {enabledServices.map((s) => (
              <button
                key={s.id}
                onClick={() => handleServiceClick(s)}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-alt transition-colors"
                title={`复制并打开 ${s.name}`}
                aria-label={`复制并打开 ${s.name}`}
              >
                <ServiceIcon service={s} className="w-5 h-5" />
              </button>
            ))}

            {enabledServices.length > 0 && (
              <div className="w-px h-5 bg-border mx-0.5" />
            )}

            {/* Copy only — does not open AI */}
            <button
              onClick={handleCopyOnly}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-surface-alt transition-colors text-text-secondary hover:text-text"
              title="仅复制所选文字"
              aria-label="仅复制所选文字"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Expand to quick actions (only meaningful if a service exists) */}
            {enabledServices.length > 0 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-surface-alt transition-colors text-text-secondary hover:text-text"
                title={expanded ? '收起快捷操作' : '展开快捷操作：解释 / 翻译 / 总结 / 改写'}
                aria-label={expanded ? '收起快捷操作' : '展开快捷操作'}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}

            <div className="w-px h-5 bg-border mx-0.5" />

            {/* Settings */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-surface-alt transition-colors text-text-secondary hover:text-text"
              title="管理 AI 问答服务"
              aria-label="管理 AI 问答服务"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick actions row — uses the first enabled service with a prompt prefix */}
          {expanded && (
            <div className="flex flex-col gap-1.5 pt-1.5 border-t border-border/60">
              <div className="flex items-center gap-1 flex-wrap">
                {QUICK_ACTIONS.map((a) => {
                  const svc = enabledServices[0]
                  return (
                    <button
                      key={a.id}
                      onClick={() => svc && handleServiceClick(svc, a.prefix)}
                      disabled={!svc}
                      className="px-2 py-1 text-[11px] text-text-secondary hover:text-text hover:bg-surface-alt rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title={svc ? `复制并打开 ${svc.name}（带"${a.label}"提示前缀）` : '请先启用一个 AI 服务'}
                    >
                      {a.label}
                    </button>
                  )
                })}
              </div>
              {/* Selected text preview — helps the user confirm what AI will see */}
              <p
                className="text-[10px] text-text-secondary/80 leading-snug line-clamp-2 max-w-[260px]"
                title={text}
              >
                {text}
              </p>
              {enabledServices[0] && (
                <p className="text-[10px] text-text-secondary/60">
                  默认使用 {enabledServices[0].name}，点上方图标可换服务
                </p>
              )}
            </div>
          )}

          {/* Status row (compact) */}
          {!expanded && (
            copied ? (
              <div className="flex items-center gap-1 px-0.5">
                <Check className="w-3 h-3 text-success" />
                <span className="text-[10px] text-success whitespace-nowrap">已复制，去粘贴</span>
              </div>
            ) : (
              <div className="px-0.5 max-w-[260px]">
                <p className="text-[10px] text-text-secondary truncate" title={text}>
                  {text.length > 24 ? `${text.slice(0, 24)}…` : text}
                  {text.length > 24 && (
                    <span className="text-text-secondary/60 ml-1">({text.length} 字)</span>
                  )}
                </p>
              </div>
            )
          )}
        </div>

        {/* When above the selection, the arrow sits below pointing down. */}
        {pos.placement === 'above' && arrowEl}
      </div>

      {/* Settings panel — stop mousedown propagation so the toolbar hideTimer doesn't fire */}
      {settingsOpen && (
        <div onMouseDown={(e) => e.stopPropagation()}>
          <AISettingsPanel
            services={services}
            onAdd={addService}
            onRemove={removeService}
            onMove={moveService}
            onToggle={toggleService}
            onUpdate={updateService}
            onReset={resetToDefaults}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}
    </>,
    document.body,
  )
}
