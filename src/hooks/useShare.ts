import { useState, useCallback, useMemo } from 'react'
import * as api from '../lib/api'
import type { ShareRecord } from '../lib/api'

export function isShareExpired(s: ShareRecord, now = Math.floor(Date.now() / 1000)): boolean {
  return s.expires_at <= now
}

/** Active shares first (original order), expired ones sink to the back. */
function sortExpiredLast(list: ShareRecord[]): ShareRecord[] {
  const active: ShareRecord[] = []
  const expired: ShareRecord[] = []
  for (const s of list) (isShareExpired(s) ? expired : active).push(s)
  return [...active, ...expired]
}

export function useShare() {
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadShares = useCallback(async (docId: string) => {
    try {
      setError(null)
      const list = await api.listShares(docId)
      setShares(sortExpiredLast(list))
    } catch {
      setError('加载分享列表失败')
    }
  }, [])

  const createShare = useCallback(async (docId: string, expiresIn: string) => {
    setLoading(true)
    setError(null)
    try {
      const record = await api.createShare(docId, expiresIn)
      setShares((prev) => sortExpiredLast([record, ...prev]))
      const url = `${window.location.origin}/share/${record.id}`
      return url
    } catch {
      setError('创建分享链接失败')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const revokeShare = useCallback(async (shareId: string) => {
    try {
      setError(null)
      await api.deleteShare(shareId)
      setShares((prev) => prev.filter((s) => s.id !== shareId))
      return true
    } catch {
      setError('撤销分享失败')
      return false
    }
  }, [])

  const revokeExpired = useCallback(async () => {
    const targets = shares.filter(isShareExpired)
    if (targets.length === 0) return true
    setError(null)
    const results = await Promise.allSettled(targets.map((s) => api.deleteShare(s.id)))
    const failedIds = new Set(
      targets.filter((_, i) => results[i].status === 'rejected').map((s) => s.id),
    )
    if (failedIds.size > 0) setError('部分失效链接清理失败，请重试')
    setShares((prev) => prev.filter((s) => !failedIds.has(s.id)))
    return failedIds.size === 0
  }, [shares])

  const expiredCount = useMemo(() => shares.filter(isShareExpired).length, [shares])

  return { shares, loading, error, expiredCount, loadShares, createShare, revokeShare, revokeExpired }
}
