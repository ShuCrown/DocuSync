import { useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface MarkdownViewerProps {
  content: string
  onTextExtracted?: (text: string) => void
}

export function MarkdownViewer({ content, onTextExtracted }: MarkdownViewerProps) {
  useEffect(() => {
    onTextExtracted?.(content)
  }, [content, onTextExtracted])

  return (
    <div className="markdown-body p-6 bg-surface-card rounded-lg border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-auto max-h-[70vh]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
