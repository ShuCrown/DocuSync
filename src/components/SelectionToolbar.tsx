import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, Settings } from 'lucide-react'
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
}

// --- Component ---

export function SelectionToolbar() {
  const { services, enabledServices, addService, removeService, moveService, toggleService, updateService, resetToDefaults } = useAIServices()
  const [text, setText] = useState('')
  const [pos, setPos] = useState<Pos | null>(null)
  const [copied, setCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Detect text selection on mouseup / keyup
  const handleSelection = useCallback(() => {
    clearTimeout(hideTimer.current)
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return

    const t = sel.toString().trim()
    if (!t) return

    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 })
    setText(t)
    setCopied(false)
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleSelection)
    document.addEventListener('keyup', handleSelection)
    return () => {
      document.removeEventListener('mouseup', handleSelection)
      document.removeEventListener('keyup', handleSelection)
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
        }
      }, 150)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const handleClick = async (service: AIService) => {
    if (!text) return

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)

    // Open popup — in Pake with --multi-window, opens as a new window within the app
    const w = 900, h = 700
    window.open(
      service.url,
      `ai-${service.id}`,
      `width=${w},height=${h},left=${Math.round((screen.width - w) / 2)},top=${Math.round((screen.height - h) / 2)},scrollbars=yes,resizable=yes`,
    )

    window.getSelection()?.removeAllRanges()
    setPos(null)
  }

  if (!pos || !text) return null

  return createPortal(
    <>
      <div
        ref={toolbarRef}
        className="fixed z-[9999] pointer-events-auto"
        style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -100%)' }}
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-card rounded-lg shadow-[0_2px_12px_rgba(44,40,37,0.12)] border border-border">
          {enabledServices.map((s) => (
            <button
              key={s.id}
              onClick={() => handleClick(s)}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-surface-alt transition-colors group"
              title={`复制并打开 ${s.name}`}
            >
              <ServiceIcon service={s} className="w-5 h-5" />
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-surface-alt transition-colors text-text-secondary hover:text-text"
            title="管理 AI 问答服务"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          {/* Copied indicator */}
          {copied ? (
            <div className="flex items-center gap-1 px-1.5">
              <Check className="w-3.5 h-3.5 text-success" />
              <span className="text-[11px] text-success whitespace-nowrap">已复制，请粘贴</span>
            </div>
          ) : text.length > 20 ? (
            <span className="text-[11px] text-text-secondary px-1.5 whitespace-nowrap">{text.length} 字</span>
          ) : null}
        </div>

        <div className="flex justify-center">
          <div className="w-2 h-2 bg-surface-card border-r border-b border-border rotate-45 -mt-1" />
        </div>
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
