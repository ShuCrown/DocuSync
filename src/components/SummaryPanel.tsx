import { Sparkles, Loader2, AlertCircle, Copy, Check } from 'lucide-react'
import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface SummaryPanelProps {
  summary: string | null
  loading: boolean
  error: string | null
  onSummarize: () => void
  hasText: boolean
}

export function SummaryPanel({ summary, loading, error, onSummarize, hasText }: SummaryPanelProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = useCallback(async () => {
    if (!summary) return
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [summary])

  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-alt">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-text">AI 文档摘要</span>
        </div>
        <div className="flex items-center gap-2">
          {summary && (
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text rounded transition-colors"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          )}
          <button
            onClick={onSummarize}
            disabled={loading || !hasText}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                生成摘要
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {error && (
          <div className="flex items-start gap-2 p-3 text-sm text-error bg-error/5 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading && !summary && (
          <div className="flex flex-col items-center py-8 text-text-secondary">
            <Loader2 className="w-8 h-8 animate-spin mb-3 text-primary" />
            <p className="text-sm">正在分析文档内容并生成摘要...</p>
          </div>
        )}

        {summary && (
          <div className="prose prose-sm max-w-none text-text">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {summary}
            </ReactMarkdown>
          </div>
        )}

        {!summary && !loading && !error && (
          <p className="text-sm text-text-secondary text-center py-6">
            上传文档后点击「生成摘要」获取 AI 分析结果
          </p>
        )}
      </div>
    </div>
  )
}
