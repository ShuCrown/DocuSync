import { Sparkles, Loader2, AlertCircle, Copy, Check, X } from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SummaryPanelProps {
  summary: string | null
  loading: boolean
  error: string | null
  onSummarize: () => void
  hasText: boolean
  open: boolean
  onClose: () => void
}

export function SummaryPanel({ summary, loading, error, onSummarize, hasText, open, onClose }: SummaryPanelProps) {
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const hasAutoTriggered = useRef(false)

  const copyToClipboard = useCallback(async () => {
    if (!summary) return
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [summary])

  // Auto-generate on first open if no summary yet
  useEffect(() => {
    if (open && hasText && !summary && !loading && !error && !hasAutoTriggered.current) {
      hasAutoTriggered.current = true
      onSummarize()
    }
  }, [open, hasText, summary, loading, error, onSummarize])

  // Reset auto-trigger flag when summary is cleared
  useEffect(() => {
    if (!summary && !loading) {
      hasAutoTriggered.current = false
    }
  }, [summary, loading])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-md max-h-[75vh] bg-surface-card rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-alt/50 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-text">AI 文档摘要</span>
          </div>
          <div className="flex items-center gap-1.5">
            {summary && (
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text rounded-md transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? '已复制' : '复制'}
              </button>
            )}
            <button
              onClick={onSummarize}
              disabled={loading || !hasText}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  {summary ? '重新生成' : '生成摘要'}
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-start gap-2 p-3 text-sm text-error bg-error/5 rounded-md border border-error/10">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading && !summary && (
            <div className="flex flex-col items-center py-8 text-text-secondary">
              <Loader2 className="w-7 h-7 animate-spin mb-3 text-primary" />
              <p className="text-sm">正在分析文档内容并生成摘要...</p>
            </div>
          )}

          {summary && (
            <div className="prose prose-sm max-w-none text-text leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary}
              </ReactMarkdown>
            </div>
          )}

          {!summary && !loading && !error && (
            <p className="text-sm text-text-secondary text-center py-6">
              点击「生成摘要」获取 AI 分析结果
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
