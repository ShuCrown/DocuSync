import { useState, useEffect, Suspense, lazy } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { UploadedFile } from '../hooks/useFileUpload'

// Lazy-load heavy viewer components — each pulls in large dependencies
// (pdfjs-dist, xlsx, docx-preview, react-markdown, etc.) that should
// only be downloaded when the user actually opens that file type.
const PdfViewer = lazy(() => import('./PdfViewer').then(m => ({ default: m.PdfViewer })))
const OfficeViewer = lazy(() => import('./OfficeViewer').then(m => ({ default: m.OfficeViewer })))
const MarkdownViewer = lazy(() => import('./MarkdownViewer').then(m => ({ default: m.MarkdownViewer })))

interface DocumentViewerProps {
  uploaded: UploadedFile
  onTextExtracted: (text: string) => void
}

function ViewerLoading() {
  return (
    <div className="flex items-center justify-center p-12 text-text-secondary">
      <Loader2 className="w-6 h-6 animate-spin mr-2" />
      加载预览组件...
    </div>
  )
}

export function DocumentViewer({ uploaded, onTextExtracted }: DocumentViewerProps) {
  const { file, category, url } = uploaded

  switch (category) {
    case 'pdf':
      return (
        <div className="h-full">
          <Suspense fallback={<ViewerLoading />}>
            <PdfViewer url={url} onTextExtracted={onTextExtracted} />
          </Suspense>
        </div>
      )

    case 'markdown':
      return (
        <div className="h-full">
          <Suspense fallback={<ViewerLoading />}>
            <MarkdownViewerWrapper file={file} onTextExtracted={onTextExtracted} />
          </Suspense>
        </div>
      )

    case 'word':
    case 'excel':
    case 'powerpoint':
      return (
        <div className="h-full">
          <Suspense fallback={<ViewerLoading />}>
            <OfficeViewer
              file={file}
              category={category}
              cacheKey={uploaded.docId ?? `${category}:${file.name}:${file.size}:${file.lastModified}`}
              onTextExtracted={onTextExtracted}
            />
          </Suspense>
        </div>
      )

    default:
      return (
        <div className="flex items-center gap-2 p-6 text-error bg-error/5 rounded-lg border border-error/10">
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

  return (
    <Suspense fallback={<ViewerLoading />}>
      <MarkdownViewer content={content} onTextExtracted={onTextExtracted} />
    </Suspense>
  )
}
