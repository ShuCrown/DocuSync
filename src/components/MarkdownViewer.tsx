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
    <div className="markdown-body p-6 bg-surface rounded-xl border border-border overflow-auto max-h-[70vh]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
