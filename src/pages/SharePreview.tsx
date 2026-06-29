import { useState, useEffect, useCallback } from 'react'
import { FileText, Loader2, AlertCircle, Clock } from 'lucide-react'
import { getShareInfo, getShareContent } from '../lib/api'
import { DocumentViewer } from '../components/DocumentViewer'
import type { ShareInfo } from '../lib/api'
import type { UploadedFile } from '../hooks/useFileUpload'

type ErrorState = { code: number; message: string } | null

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  powerpoint: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  markdown: 'text/markdown',
}

export default function SharePreview() {
  const token = window.location.pathname.replace('/share/', '').split('/')[0]
  const [info, setInfo] = useState<ShareInfo | null>(null)
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null)
  const [error, setError] = useState<ErrorState>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return () => {
      if (uploaded?.url) URL.revokeObjectURL(uploaded.url)
    }
  }, [uploaded?.url])

  const load = useCallback(async () => {
    if (!token) {
      setError({ code: 400, message: '无效的分享链接' })
      setLoading(false)
      return
    }

    try {
      const shareInfo = await getShareInfo(token)
      setInfo(shareInfo)

      const res = await getShareContent(token)
      const blob = await res.blob()
      const file = new File([blob], shareInfo.name, {
        type: MIME_MAP[shareInfo.category] ?? blob.type ?? 'application/octet-stream',
      })
      const url = URL.createObjectURL(file)
      setUploaded({ file, category: shareInfo.category as UploadedFile['category'], url, docId: '' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      const statusMatch = msg.match(/(\d{3})/)
      const code = statusMatch ? parseInt(statusMatch[1]) : 500
      setError({
        code,
        message: code === 410 ? '该链接已失效' : code === 404 ? '链接不存在或已过期' : msg,
      })
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const formatExpiry = (ts: number) => {
    return new Date(ts * 1000).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="h-screen bg-surface flex flex-col overflow-hidden">
      {/* Minimal header */}
      <header className="border-b border-border bg-surface-card/80 backdrop-blur-sm shrink-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-2.5">
          <FileText className="w-4.5 h-4.5 text-primary shrink-0" />
          <span className="text-base font-medium text-text tracking-tight">DocuSync</span>
          <span className="text-xs text-text-secondary tracking-wide">文件预览</span>
          {info && (
            <span className="text-xs text-text-secondary ml-auto truncate max-w-[200px]">{info.name}</span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 min-h-0 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-text-secondary">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            加载中...
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-error mx-auto" />
              <div className="text-lg font-medium text-text">
                {error.code === 410 ? '链接已失效' : '无法访问'}
              </div>
              <div className="text-sm text-text-secondary">{error.message}</div>
              <a
                href="/"
                className="inline-block mt-2 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                返回首页
              </a>
            </div>
          </div>
        ) : uploaded ? (
          <div className="flex-1 min-h-0">
            <DocumentViewer uploaded={uploaded} onTextExtracted={() => {}} />
          </div>
        ) : null}
      </main>

      {/* Footer */}
      {info && !loading && !error && (
        <footer className="border-t border-border bg-surface-card/60 shrink-0 px-4 py-2.5 text-center">
          <span className="text-xs text-text-secondary flex items-center justify-center gap-1.5">
            <Clock className="w-3 h-3" />
            此文件通过 DocuSync 分享 · 有效至 {formatExpiry(info.expiresAt)}
          </span>
        </footer>
      )}
    </div>
  )
}
