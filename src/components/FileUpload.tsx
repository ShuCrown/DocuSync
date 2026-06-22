import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, X } from 'lucide-react'
import { getCategoryLabel, type FileCategory } from '../utils/fileType'

interface FileUploadProps {
  onFile: (file: File) => void
  currentFile?: { file: File; category: FileCategory } | null
  onClear?: () => void
  error?: string | null
}

export function FileUpload({ onFile, currentFile, onClear, error }: FileUploadProps) {
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
      <div className="flex items-center gap-3 p-4 bg-surface-alt border border-border rounded-xl">
        <FileText className="w-8 h-8 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text truncate">{currentFile.file.name}</p>
          <p className="text-xs text-text-secondary">
            {getCategoryLabel(currentFile.category)} · {(currentFile.file.size / 1024).toFixed(1)} KB
          </p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-lg hover:bg-border transition-colors text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary-light'}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="w-10 h-10 mx-auto mb-3 text-text-secondary" />
        <p className="text-text font-medium">
          {isDragActive ? '释放文件到此处' : '拖拽文件或点击选择'}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          支持 PDF、Markdown、Word、Excel、PPT（最大 50MB）
        </p>
      </div>
      {error && (
        <p className="mt-2 text-sm text-error">{error}</p>
      )}
    </div>
  )
}
