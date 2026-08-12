import { useState, useCallback, useEffect, useRef } from 'react'
import * as api from '../lib/api'
import type { FileCategory } from '../utils/fileType'

export interface FileRecord {
  id: string
  name: string
  size: number
  category: FileCategory
  timestamp: number
}

// ---------------------------------------------------------------------------
// Locally "hidden" doc ids. Removing a record from 最近查看 only hides it
// here — the uploaded file stays on the server (R2 / local disk) and can be
// reopened any time from the "我的文件" picker. Server-side deletion is NOT
// called, so the file is never lost by tidying up the list.
// ---------------------------------------------------------------------------

const HIDDEN_KEY = 'docusync.hidden-doc-ids'

function loadHiddenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveHiddenIds(ids: Set<string>) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]))
  } catch {
    // Ignore storage failures (private mode etc.) — hiding still works for
    // the current session.
  }
}

export function useFileHistory() {
  /** Visible records (all uploaded docs minus locally hidden ones). */
  const [history, setHistory] = useState<FileRecord[]>([])
  /** Every uploaded document on this device, including hidden ones — the
      source for the "我的文件" picker that reopens lost records. */
  const [allDocuments, setAllDocuments] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const hiddenIdsRef = useRef<Set<string>>(loadHiddenIds())

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const docs = await api.listDocuments()
      const records: FileRecord[] = docs.map((d) => ({
        id: d.id,
        name: d.name,
        size: d.size,
        category: d.category as FileCategory,
        timestamp: d.created_at * 1000, // server returns unix seconds
      }))
      setAllDocuments(records)
      setHistory(records.filter((r) => !hiddenIdsRef.current.has(r.id)))
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

  const removeHistory = useCallback((id: string) => {
    // Hide locally only — do NOT call api.deleteDocument (that would remove
    // the uploaded file from the server). The file stays reopenable.
    hiddenIdsRef.current.add(id)
    saveHiddenIds(hiddenIdsRef.current)
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const clearHistory = useCallback(() => {
    // Hide every known document — nothing is deleted server-side.
    hiddenIdsRef.current = new Set([
      ...hiddenIdsRef.current,
      ...allDocuments.map((r) => r.id),
    ])
    saveHiddenIds(hiddenIdsRef.current)
    setHistory([])
  }, [allDocuments])

  /** Permanent delete — removes the file from storage (server/local disk).
      Used by the "all files" picker with an explicit double-confirmation; the
      record is also dropped from the local hidden list and both states. */
  const deleteDocument = useCallback(async (id: string) => {
    await api.deleteDocument(id)
    hiddenIdsRef.current.delete(id)
    saveHiddenIds(hiddenIdsRef.current)
    setAllDocuments((prev) => prev.filter((r) => r.id !== id))
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }, [])

  return {
    history,
    allDocuments,
    loading,
    addHistory,
    removeHistory,
    clearHistory,
    deleteDocument,
    refresh: fetchHistory,
  }
}
