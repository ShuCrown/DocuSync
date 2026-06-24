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
