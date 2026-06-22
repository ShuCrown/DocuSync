import { useState, useCallback } from 'react'
import { requestSummary } from '../services/summaryService'

export function useSummary() {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summarize = useCallback(async (text: string) => {
    if (!text.trim()) {
      setError('无法提取文档文本内容')
      return
    }

    setLoading(true)
    setError(null)
    setSummary(null)

    try {
      const result = await requestSummary(text)
      setSummary(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '摘要生成失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setSummary(null)
    setError(null)
  }, [])

  return { summary, loading, error, summarize, clear }
}
