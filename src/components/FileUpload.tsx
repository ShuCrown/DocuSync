import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { getCategoryLabel, type FileCategory } from '../utils/fileType'

interface FileUploadProps {
  onFile: (file: File) => void
  currentFile?: { file: File; category: FileCategory } | null
  onClear?: () => void
  uploading?: boolean
  error?: string | null
  compact?: boolean
}

export function FileUpload({ onFile, currentFile, onClear, uploading, error, compact }: FileUploadProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) {
        onFile(accepted[0]!)
      }
    },
    [onFile],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading,
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

  if (currentFile) {
    return (
      <div className="flex items-center gap-3 p-4 bg-surface-card border border-border rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <FileText className="w-7 h-7 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">{currentFile.file.name}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {getCategoryLabel(currentFile.category)} · {(currentFile.file.size / 1024).toFixed(1)} KB
          </p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-md hover:bg-surface-alt transition-colors text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }

  if (compact) {
    return (
      <div>
        <div
          {...getRootProps()}
          className={`
            border border-dashed rounded-lg p-4 text-center cursor-pointer transition-all
            ${uploading ? 'opacity-60 pointer-events-none' : ''}
            ${isDragActive
              ? 'border-primary bg-primary/[0.03]'
              : 'border-border hover:border-primary-light hover:bg-surface-card/60'
            }
          `}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <Loader2 className="w-5 h-5 mx-auto text-primary animate-spin" />
          ) : (
            <>
              <Upload className="w-5 h-5 mx-auto mb-1.5 text-text-secondary/70" />
              <p className="text-xs text-text font-medium">
                {isDragActive ? '释放文件' : '上传新文件'}
              </p>
            </>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-xs text-error">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border border-dashed rounded-lg p-10 text-center cursor-pointer transition-all
          ${uploading ? 'opacity-60 pointer-events-none' : ''}
          ${isDragActive
            ? 'border-primary bg-primary/[0.03] shadow-[0_0_0_3px_rgba(27,54,93,0.06)]'
            : 'border-border hover:border-primary-light hover:bg-surface-card/60'
          }
        `}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 mx-auto mb-3 text-primary animate-spin" />
            <p className="text-text font-medium tracking-wide">正在上传...</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto mb-3 text-text-secondary/70" />
            <p className="text-text font-medium tracking-wide">
              {isDragActive ? '释放文件到此处' : '拖拽文件或点击选择'}
            </p>
            <p className="text-sm text-text-secondary mt-1.5">
              支持 PDF、Markdown、Word、Excel、PPT（最大 50MB）
            </p>
          </>
        )}
      </div>
      {error && (
        <p className="mt-2.5 text-sm text-error">{error}</p>
      )}
    </div>
  )
}
