import { FileText, Clock, X } from 'lucide-react'
import { getCategoryLabel } from '../utils/fileType'
import type { FileRecord } from '../hooks/useFileHistory'

interface FileHistoryProps {
  history: FileRecord[]
  onSelect: (record: FileRecord) => void
  onRemove: (id: string) => void
  onClear: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour

  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function FileHistory({ history, onSelect, onRemove, onClear }: FileHistoryProps) {
  if (history.length === 0) return null

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">最近查看</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-text-secondary hover:text-error transition-colors"
        >
          清空记录
        </button>
      </div>

      <div className="border border-border rounded-lg bg-surface-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] divide-y divide-border">
        {history.map((record) => (
          <div
            key={record.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt/50 transition-colors group"
          >
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <button
              onClick={() => onSelect(record)}
              className="flex-1 min-w-0 text-left"
            >
              <p className="text-sm font-medium text-text truncate">{record.name}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                <span className="inline-block px-1.5 py-0.5 bg-surface-alt rounded text-[11px] mr-1.5">
                  {getCategoryLabel(record.category)}
                </span>
                {formatSize(record.size)} · {formatTime(record.timestamp)}
              </p>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(record.id)
              }}
              className="p-1 rounded-md text-text-secondary/50 hover:text-error hover:bg-error/5 opacity-0 group-hover:opacity-100 transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
