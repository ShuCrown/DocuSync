import { useState } from 'react'
import { Clock, X, MoreHorizontal, Search } from 'lucide-react'
import { getCategoryLabel } from '../utils/fileType'
import { FileTypeIcon } from '../utils/fileIcon'
import { formatTime, formatSize } from '../utils/formatTime'
import { HistoryPickerModal } from './HistoryPickerModal'
import type { FileRecord } from '../hooks/useFileHistory'

interface FileHistoryProps {
  history: FileRecord[]
  onSelect: (record: FileRecord) => void
  /** Hide a record from 最近查看 (file stays on the server). */
  onRemove: (id: string) => void
  onClear: () => void
  /** Permanent delete used by the all-files picker (double-confirmed). */
  onDelete?: (id: string) => Promise<void> | void
  /** Every uploaded document (including ones removed from this list). The
      search / "更多" picker lists these, so hidden records stay reopenable
      without a separate "我的文件" entry. */
  allDocuments?: FileRecord[]
}

/** Max rows shown inline; the rest are reachable via the "more" picker. */
const MAX_VISIBLE = 8

export function FileHistory({ history, onSelect, onRemove, onClear, onDelete, allDocuments }: FileHistoryProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  if (history.length === 0) return null

  const visible = history.slice(0, MAX_VISIBLE)
  const hasMore = history.length > MAX_VISIBLE
  // The picker shows the FULL list (including hidden records) so a removed
  // record can always be reopened — one entry point, no separate "我的文件".
  const pickerRecords = allDocuments && allDocuments.length > 0 ? allDocuments : history

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-text-secondary">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">最近查看</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Search the full history — always available, regardless of count. */}
          <button
            onClick={() => setPickerOpen(true)}
            title="查找历史记录"
            className="p-1 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt/60 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClear}
            className="text-xs text-text-secondary hover:text-error transition-colors"
          >
            清空记录
          </button>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-surface-card shadow-[0_1px_3px_rgba(0,0,0,0.04)] divide-y divide-border">
        {visible.map((record) => (
          <div
            key={record.id}
            className="flex items-center gap-3 px-4 py-3 hover:bg-surface-alt/50 transition-colors group"
          >
            <FileTypeIcon category={record.category} className="w-5 h-5 shrink-0" />
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
              title="从最近查看移除（文件保留，可在“我的文件”找回）"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {/* More — opens the searchable full-list picker (VSCode quick-open style).
            Clicking only pops the modal; nothing is expanded inline. */}
        {hasMore && (
          <button
            onClick={() => setPickerOpen(true)}
            title="打开可检索的完整列表"
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
            更多
          </button>
        )}
      </div>

      {pickerOpen && (
        <HistoryPickerModal
          records={pickerRecords}
          onSelect={onSelect}
          onRemove={onDelete}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
