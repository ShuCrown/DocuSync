import { useState, useEffect } from 'react'
import { PdfViewer } from './PdfViewer'
import { MarkdownViewer } from './MarkdownViewer'
import { OfficeViewer } from './OfficeViewer'
import { AlertCircle } from 'lucide-react'
import type { UploadedFile } from '../hooks/useFileUpload'

interface DocumentViewerProps {
  uploaded: UploadedFile
  onTextExtracted: (text: string) => void
}

export function DocumentViewer({ uploaded, onTextExtracted }: DocumentViewerProps) {
  const { file, category, url } = uploaded

  switch (category) {
    case 'pdf':
      return <PdfViewer url={url} onTextExtracted={onTextExtracted} />

    case 'markdown':
      return (
        <MarkdownViewerWrapper file={file} onTextExtracted={onTextExtracted} />
      )

    case 'word':
    case 'excel':
    case 'powerpoint':
      return <OfficeViewer file={file} category={category} onTextExtracted={onTextExtracted} />

    default:
      return (
        <div className="flex items-center gap-2 p-6 text-error bg-error/5 rounded-xl border border-error/20">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>不支持预览此文件格式</span>
        </div>
      )
  }
}

function MarkdownViewerWrapper({
  file,
  onTextExtracted,
}: {
  file: File
  onTextExtracted: (text: string) => void
}) {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    file.text().then((text) => {
      if (!cancelled) setContent(text)
    })
    return () => { cancelled = true }
  }, [file])

  if (content === null) {
    return (
      <div className="flex items-center justify-center p-12 text-text-secondary">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
        加载中...
      </div>
    )
  }

  return <MarkdownViewer content={content} onTextExtracted={onTextExtracted} />
}
