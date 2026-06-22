import { useState, useCallback, useEffect } from 'react'
import * as api from '../lib/api'
import type { FileCategory } from '../utils/fileType'

export interface FileRecord {
  id: string
  name: string
  size: number
  category: FileCategory
  timestamp: number
}

export function useFileHistory() {
  const [history, setHistory] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const docs = await api.listDocuments()
      setHistory(
        docs.map((d) => ({
          id: d.id,
          name: d.name,
          size: d.size,
          category: d.category as FileCategory,
          timestamp: d.created_at * 1000, // server returns unix seconds
        }))
      )
    } catch (err) {
      console.error('Failed to fetch history:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const addHistory = useCallback((_file: { name: string; size: number }, _category: FileCategory) => {
    // History is added server-side during upload; just refresh
    fetchHistory()
  }, [fetchHistory])

  const removeHistory = useCallback(async (id: string) => {
    try {
      await api.deleteDocument(id)
      setHistory((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      console.error('Failed to delete document:', err)
    }
  }, [])

  const clearHistory = useCallback(async () => {
    try {
      await Promise.all(history.map((r) => api.deleteDocument(r.id)))
      setHistory([])
    } catch (err) {
      console.error('Failed to clear history:', err)
    }
  }, [history])

  return { history, loading, addHistory, removeHistory, clearHistory, refresh: fetchHistory }
}
