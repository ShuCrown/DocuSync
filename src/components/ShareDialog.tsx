import { useState, useEffect, useCallback } from 'react'
import { X, Link, Copy, Check, Loader2, Trash2, Clock, Eye, Plus, Info } from 'lucide-react'
import { useShare } from '../hooks/useShare'
import type { ShareRecord } from '../lib/api'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  docId: string
  fileName: string
}

const EXPIRY_OPTIONS = [
  { value: '1h', label: '1 小时' },
  { value: '24h', label: '24 小时' },
  { value: '7d', label: '7 天' },
  { value: '30d', label: '30 天' },
  { value: 'never', label: '永久', desc: '1 年' },
]

export function ShareDialog({ open, onClose, docId, fileName }: ShareDialogProps) {
  const { shares, loading, error, loadShares, createShare, revokeShare } = useShare()
  const [expiresIn, setExpiresIn] = useState('24h')
  const [showCreate, setShowCreate] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setShowCreate(false)
      setCopiedId(null)
      setExpiresIn('24h')
      loadShares(docId)
    }
  }, [open, docId, loadShares])

  // Auto-expand create form if no existing shares
  useEffect(() => {
    if (!loading && shares.length === 0) setShowCreate(true)
  }, [loading, shares.length])

  const handleCreate = useCallback(async () => {
    const url = await createShare(docId, expiresIn)
    if (url) {
      setShowCreate(false)
      // Auto-copy the new link
      try {
        await navigator.clipboard.writeText(url)
        // Find the newly created share (first in list after reload)
        await loadShares(docId)
      } catch { /* ignore */ }
    }
  }, [docId, expiresIn, createShare, loadShares])

  const handleCopy = useCallback(async (shareId: string) => {
    const url = `${window.location.origin}/share/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(shareId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch { /* ignore */ }
  }, [])

  const handleRevoke = useCallback(async (shareId: string) => {
    await revokeShare(shareId)
  }, [revokeShare])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-surface-card rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Link className="w-4.5 h-4.5 text-primary" />
            <span className="font-medium text-text">分享文档</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* File name */}
          <div className="text-sm text-text-secondary truncate">{fileName}</div>

          {/* Tip */}
          <div className="flex gap-2.5 p-3 bg-primary/5 border border-primary/10 rounded-lg text-xs text-text-secondary">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              拥有链接的人可以查看此文件。如需停止分享，可随时撤销链接。
            </div>
          </div>

          {/* Existing shares */}
          {loading ? (
            <div className="flex items-center justify-center py-6 text-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              加载中...
            </div>
          ) : shares.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-secondary">已创建的链接</div>
              {shares.map((s) => (
                <ShareItem
                  key={s.id}
                  share={s}
                  copied={copiedId === s.id}
                  onCopy={handleCopy}
                  onRevoke={handleRevoke}
                />
              ))}
            </div>
          ) : null}

          {/* Create new share */}
          {showCreate ? (
            <div className="space-y-3 pt-1">
              <div className="text-xs font-medium text-text-secondary">设置有效期</div>
              <div className="flex flex-wrap gap-2">
                {EXPIRY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExpiresIn(opt.value)}
                    className={`
                      flex-1 min-w-[calc(33.3%-0.5rem)] px-3 py-2 rounded-lg text-sm text-center transition-colors border
                      ${expiresIn === opt.value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-text-secondary hover:border-primary/40 hover:bg-surface-alt'
                      }
                    `}
                  >
                    <span>{opt.label}</span>
                    {opt.desc && <span className="text-[11px] opacity-50 ml-1">{opt.desc}</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-primary text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                生成链接
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm text-text-secondary hover:text-text hover:border-primary/40 hover:bg-surface-alt transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              创建新链接
            </button>
          )}

          {error && (
            <div className="text-sm text-error bg-error/5 border border-error/10 rounded-lg p-3">{error}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ShareItem({
  share,
  copied,
  onCopy,
  onRevoke,
}: {
  share: ShareRecord
  copied: boolean
  onCopy: (id: string) => void
  onRevoke: (id: string) => void
}) {
  const now = Math.floor(Date.now() / 1000)
  const expired = share.expires_at <= now

  const formatTime = (ts: number) =>
    new Date(ts * 1000).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="flex items-center gap-3 px-3 py-3 bg-surface-alt/50 rounded-lg">
      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <span className={`text-xs ${expired ? 'text-text-secondary line-through' : 'text-text'}`}>
          {expired ? '已过期' : (
            <span className="flex items-center gap-1 text-text-secondary">
              <Clock className="w-3 h-3" />
              有效至 {formatTime(share.expires_at)}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5 text-text-secondary/60 text-[11px]">
          <Eye className="w-3 h-3" />
          <span>{share.view_count} 次查看</span>
        </div>
      </div>

      {/* Actions */}
      {!expired && (
        <button
          onClick={() => onCopy(share.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-white hover:opacity-90 transition-opacity"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? '已复制' : '复制'}
        </button>
      )}
      <button
        onClick={() => onRevoke(share.id)}
        className="p-1.5 rounded-md text-text-secondary/40 hover:text-error hover:bg-error/10 transition-colors"
        title="撤销链接"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
