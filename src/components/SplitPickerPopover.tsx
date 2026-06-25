import { useRef, useEffect, useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Upload, X, Loader2 } from 'lucide-react'
import { getCategoryLabel } from '../utils/fileType'
import { formatTime } from '../utils/formatTime'
import type { FileRecord } from '../hooks/useFileHistory'
import type { UploadedFile } from '../hooks/useFileUpload'
import * as api from '../lib/api'

interface SplitPickerPopoverProps {
  open: boolean
  onClose: () => void
  history: FileRecord[]
  onSelect: (file: UploadedFile) => void
  onUpload: (file: File) => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export function SplitPickerPopover({
  open,
  onClose,
  history,
  onSelect,
  onUpload,
  anchorRef,
}: SplitPickerPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  // Position the popover below the anchor
  const [position, setPosition] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (open && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      })
    }
  }, [open, anchorRef])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  // Close on ESC
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleHistoryClick = async (record: FileRecord) => {
    setLoadingId(record.id)
    try {
      const blob = await api.downloadDocument(record.id)
      if (blob.size === 0) return
      const file = new File([blob], record.name, { type: blob.type })
      const url = URL.createObjectURL(file)
      onSelect({
        file,
        category: record.category,
        url,
        docId: record.id,
      })
    } catch {
      // silently fail, user can retry
    } finally {
      setLoadingId(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
      e.target.value = ''
    }
  }

  // Drag-and-drop (same pattern as home page FileUpload)
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onUpload(accepted[0]!)
        onClose()
      }
    },
    [onUpload, onClose],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true, // don't trigger file picker on click (buttons handle that)
    noKeyboard: true,
    accept: {
      'application/pdf': ['.pdf'],
      'text/markdown': ['.md', '.markdown'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
    },
  })

  if (!open) return null

  return (
    <div
      ref={popoverRef}
      {...getRootProps()}
      className={`fixed z-50 w-80 bg-surface-card border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden transition-colors ${
        isDragActive ? 'border-primary bg-primary/[0.03]' : 'border-border'
      }`}
      style={{ top: position.top, right: position.right }}
    >
      <input {...getInputProps()} />

      {/* Drag overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary/[0.06] rounded-lg">
          <Upload className="w-8 h-8 text-primary mb-2" />
          <p className="text-sm font-medium text-primary">释放文件到此处</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-surface-alt/40">
        <span className="text-xs font-medium text-text-secondary">选择对比文档</span>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-text-secondary/60 hover:text-text transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* History list */}
      <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
        {history.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-text-secondary">
            暂无历史文档
          </div>
        ) : (
          history.map((record) => (
            <button
              key={record.id}
              onClick={() => handleHistoryClick(record)}
              disabled={loadingId !== null}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface-alt/50 transition-colors text-left disabled:opacity-50"
            >
              {loadingId === record.id ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              ) : (
                <FileText className="w-4 h-4 text-text-secondary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{record.name}</p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  <span className="inline-block px-1 py-0.5 bg-surface-alt rounded text-[10px] mr-1">
                    {getCategoryLabel(record.category)}
                  </span>
                  {formatTime(record.timestamp)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Upload button (same style as home page FileUpload compact) */}
      <div className="border-t border-border">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.md,.markdown,.docx,.doc,.xlsx,.xls,.pptx,.ppt"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
        >
          <Upload className="w-4 h-4" />
          上传新文件
        </button>
      </div>
    </div>
  )
}
