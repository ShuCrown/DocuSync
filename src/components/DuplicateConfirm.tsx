import { AlertTriangle, FileText, X } from 'lucide-react'

interface DuplicateConfirmProps {
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DuplicateConfirm({ fileName, onConfirm, onCancel }: DuplicateConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-surface-card rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-alt/50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-sm font-medium text-text">同名文件已存在</span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2.5 p-3 bg-surface-alt/50 rounded-lg mb-3">
            <FileText className="w-4.5 h-4.5 text-primary shrink-0" />
            <span className="text-sm text-text truncate">{fileName}</span>
          </div>
          <p className="text-sm text-text-secondary">
            历史记录中已有同名文件，是否继续上传？
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface-alt/30">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 text-sm text-text-secondary hover:text-text rounded-md hover:bg-surface-alt transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-3.5 py-1.5 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
          >
            继续上传
          </button>
        </div>
      </div>
    </div>
  )
}
