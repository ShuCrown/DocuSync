import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { ImagePreviewModal } from './ImagePreviewModal'

interface MarkdownViewerProps {
  content: string
  onTextExtracted?: (text: string) => void
}

export function MarkdownViewer({ content, onTextExtracted }: MarkdownViewerProps) {
  const latestOnTextExtractedRef = useRef(onTextExtracted)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  useEffect(() => {
    latestOnTextExtractedRef.current?.(content)
  }, [content])

  const handleImageClick = useCallback((src: string) => setPreviewSrc(src), [])
  const handleClosePreview = useCallback(() => setPreviewSrc(null), [])

  return (
    <div className="markdown-body p-6 bg-surface-card overflow-auto flex-1">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Click-to-preview images, consistent with the docx viewer
          img: ({ src, alt }) => (
            <img
              src={typeof src === 'string' ? src : undefined}
              alt={alt ?? ''}
              loading="lazy"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                const el = e.currentTarget
                const s = el.currentSrc || el.src
                if (s) handleImageClick(s)
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {previewSrc && <ImagePreviewModal src={previewSrc} onClose={handleClosePreview} />}
    </div>
  )
}
