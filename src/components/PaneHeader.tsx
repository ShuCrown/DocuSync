import { FileText, X, RefreshCw, Share2 } from 'lucide-react'
import type { UploadedFile } from '../hooks/useFileUpload'

interface PaneHeaderProps {
  file: UploadedFile
  pane: 'a' | 'b'
  isActive: boolean
  onClose: () => void
  onReplace?: () => void
  onFocus: (pane: 'a' | 'b') => void
  onShare?: () => void
}

export function PaneHeader({ file, pane, isActive, onClose, onReplace, onFocus, onShare }: PaneHeaderProps) {
  return (
    <div
      onClick={() => onFocus(pane)}
      className={`
        flex items-center gap-2 px-3 py-1.5 border-b transition-colors cursor-pointer
        ${isActive
          ? 'bg-surface-card border-border'
          : 'bg-surface-alt/50 border-transparent hover:bg-surface-alt'
        }
      `}
    >
      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-xs font-medium text-text truncate flex-1">
        {file.file.name}
      </span>

      {/* Share button */}
      {file.docId && onShare && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onShare()
          }}
          className="p-1 rounded text-text-secondary/60 hover:text-primary hover:bg-surface-alt transition-colors"
          title="分享文档"
        >
          <Share2 className="w-3 h-3" />
        </button>
      )}

      {/* Replace button (Pane B only) */}
      {pane === 'b' && onReplace && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onReplace()
          }}
          className="p-1 rounded text-text-secondary/60 hover:text-primary hover:bg-surface-alt transition-colors"
          title="更换文档"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="p-1 rounded text-text-secondary/60 hover:text-error hover:bg-error/10 transition-colors"
        title={pane === 'a' ? '退出分屏 (保留此文档)' : '关闭此面板'}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
