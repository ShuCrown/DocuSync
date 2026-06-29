import { useState, useCallback } from 'react'
import * as api from '../lib/api'
import type { ShareRecord } from '../lib/api'

export function useShare() {
  const [shares, setShares] = useState<ShareRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadShares = useCallback(async (docId: string) => {
    try {
      setError(null)
      const list = await api.listShares(docId)
      setShares(list)
    } catch {
      setError('加载分享列表失败')
    }
  }, [])

  const createShare = useCallback(async (docId: string, expiresIn: string) => {
    setLoading(true)
    setError(null)
    try {
      const record = await api.createShare(docId, expiresIn)
      setShares((prev) => [record, ...prev])
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

  return { shares, loading, error, loadShares, createShare, revokeShare }
}
