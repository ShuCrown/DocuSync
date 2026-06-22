import { useState, useCallback } from 'react'
import * as api from '../lib/api'

export function useSummary() {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summarize = useCallback(async (docId: string, text?: string) => {
    setLoading(true)
    setError(null)

    try {
      const result = await api.summarizeDocument(docId, text)
      setSummary(result.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : '摘要生成失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCached = useCallback(async (docId: string) => {
    try {
      const result = await api.getSummary(docId)
      if (result.summary) {
        setSummary(result.summary)
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  const clear = useCallback(() => {
    setSummary(null)
    setError(null)
  }, [])

  return { summary, loading, error, summarize, loadCached, clear }
}
