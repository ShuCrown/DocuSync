import { FileText, X, Share2 } from 'lucide-react'

interface SimplePaneHeaderProps {
  fileName: string
  docId?: string
  onClose: () => void
  onShare?: () => void
}

export function SimplePaneHeader({ fileName, docId, onClose, onShare }: SimplePaneHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-card shrink-0">
      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-xs font-medium text-text truncate flex-1">
        {fileName}
      </span>
      {docId && onShare && (
        <button
          onClick={onShare}
          className="p-1 rounded text-text-secondary/60 hover:text-primary hover:bg-surface-alt transition-colors"
          title="分享文档"
        >
          <Share2 className="w-3 h-3" />
        </button>
      )}
      <button
        onClick={onClose}
        className="p-1 rounded text-text-secondary/60 hover:text-error hover:bg-error/10 transition-colors"
        title="关闭文档"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
