import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface MarkdownViewerProps {
  content: string
  onTextExtracted?: (text: string) => void
}

export function MarkdownViewer({ content, onTextExtracted }: MarkdownViewerProps) {
  const latestOnTextExtractedRef = useRef(onTextExtracted)

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  useEffect(() => {
    latestOnTextExtractedRef.current?.(content)
  }, [content])

  return (
    <div className="markdown-body p-6 bg-surface-card overflow-auto h-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
