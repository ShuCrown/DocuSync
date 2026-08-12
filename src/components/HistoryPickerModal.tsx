import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import type { FileRecord } from '../hooks/useFileHistory'
import { getCategoryLabel } from '../utils/fileType'
import { FileTypeIcon } from '../utils/fileIcon'
import { formatTime, formatSize } from '../utils/formatTime'

interface HistoryPickerModalProps {
  records: FileRecord[]
  onSelect: (record: FileRecord) => void
  /** Permanent delete — requires an inline second confirmation before firing. */
  onRemove?: (id: string) => void | Promise<void>
  onClose: () => void
}

/**
 * VSCode Quick-Open-style picker for the full history list: a centered panel
 * with a filter box on top, keyboard navigation (↑/↓ + Enter, Esc to close)
 * and a result list filtered by file name. Picking a record opens it; the
 * trailing delete button permanently removes the file after an inline
 * confirmation ("删除" → "确认?"), so a stray click can never lose data.
 */
export function HistoryPickerModal({ records, onSelect, onRemove, onClose }: HistoryPickerModalProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter((r) => r.name.toLowerCase().includes(q))
  }, [records, query])

  // Autofocus + Esc / outside-click close.
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Keep the highlighted row inside the viewport when it moves.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, filtered])

  // Reset highlight when the query changes the result list.
  useEffect(() => {
    setActiveIdx(0)
  }, [query])

  const pick = (r: FileRecord) => {
    onSelect(r)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const r = filtered[activeIdx]
      if (r) pick(r)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[16vh] bg-black/30 backdrop-blur-[2px]"
      onMouseDown={onClose}
    >
      <div
        className="w-[34rem] max-w-[calc(100vw-2rem)] bg-surface-card border border-border rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.22)] overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ transformOrigin: 'top center', animation: 'docusync-pop-in 140ms ease-out' }}
      >
        {/* Filter box */}
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 text-text-secondary shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="输入文件名筛选…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm py-3 text-text placeholder:text-text-secondary/60"
          />
          <span className="text-[11px] text-text-secondary shrink-0 tabular-nums">{filtered.length} 条</span>
        </div>

        {/* Result list */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-text-secondary">没有匹配的记录</div>
          ) : (
            filtered.map((r, idx) => {
              const active = idx === activeIdx
              return (
                <div
                  key={r.id}
                  data-active={active}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`flex items-center px-3 transition-colors ${
                    active ? 'bg-primary/10' : 'hover:bg-surface-alt/50'
                  }`}
                >
                  <button
                    onClick={() => pick(r)}
                    className="flex-1 min-w-0 flex items-center gap-2.5 py-2 text-left"
                  >
                    <FileTypeIcon category={r.category} className="w-4 h-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-text truncate">{r.name}</p>
                      <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                        <span className="inline-block px-1 py-0.5 bg-surface-alt rounded text-[10px] mr-1.5">
                          {getCategoryLabel(r.category)}
                        </span>
                        {formatSize(r.size)} · 预览时间：{formatTime(r.openedAt ?? r.timestamp)}
                      </p>
                    </div>
                  </button>

                  {onRemove && (confirmId === r.id ? (
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <span className="text-[11px] text-text-secondary whitespace-nowrap">确认删除？</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          setDeleting(true)
                          try {
                            await onRemove(r.id)
                            setConfirmId(null)
                          } finally {
                            setDeleting(false)
                          }
                        }}
                        disabled={deleting}
                        className="px-2 py-1 text-[11px] font-medium text-white bg-error rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        删除
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmId(null)
                        }}
                        className="px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-alt rounded-md transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmId(r.id)
                      }}
                      title="彻底删除该文件"
                      className="p-1 rounded text-text-secondary/50 hover:text-error hover:bg-error/10 transition-colors shrink-0 ml-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              )
            })
          )}
        </div>

        {/* Keyboard hints */}
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border bg-surface-alt/30 text-[10px] text-text-secondary">
          <span>↑↓ 选择</span>
          <span>↵ 打开</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
