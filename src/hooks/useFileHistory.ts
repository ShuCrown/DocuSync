import { useState, useCallback, useEffect, useRef } from 'react'
import * as api from '../lib/api'
import type { FileCategory } from '../utils/fileType'

export interface FileRecord {
  id: string
  name: string
  size: number
  category: FileCategory
  /** Creation time (server) in ms. */
  timestamp: number
  /** Last time this document was opened on this device (ms), if any. */
  openedAt?: number
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

// ---------------------------------------------------------------------------
// Locally tracked "last opened" timestamps (docId → ts). 最近查看 sorts by
// these, so reopening an old document bumps it to the top — the server list
// only knows created_at and would otherwise keep the original order.
// ---------------------------------------------------------------------------

const OPENED_KEY = 'docusync.opened-order'

function loadOpenedOrder(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(OPENED_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function saveOpenedOrder(order: Record<string, number>) {
  try {
    localStorage.setItem(OPENED_KEY, JSON.stringify(order))
  } catch {
    // Ignore storage failures.
  }
}

/** Sort: recently opened first (desc), then by creation time (desc). */
function sortByOpened(records: FileRecord[], order: Record<string, number>): FileRecord[] {
  return [...records].sort((a, b) => {
    const ao = order[a.id] ?? -1
    const bo = order[b.id] ?? -1
    if (ao !== bo) return bo - ao
    return b.timestamp - a.timestamp
  })
}

export function useFileHistory() {
  /** Visible records (all uploaded docs minus locally hidden ones). */
  const [history, setHistory] = useState<FileRecord[]>([])
  /** Every uploaded document on this device, including hidden ones — the
      source for the "我的文件" picker that reopens lost records. */
  const [allDocuments, setAllDocuments] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const hiddenIdsRef = useRef<Set<string>>(loadHiddenIds())
  const openedOrderRef = useRef<Record<string, number>>(loadOpenedOrder())

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const docs = await api.listDocuments()
      const records: FileRecord[] = sortByOpened(
        docs.map((d) => ({
          id: d.id,
          name: d.name,
          size: d.size,
          category: d.category as FileCategory,
          timestamp: d.created_at * 1000, // server returns unix seconds
          openedAt: openedOrderRef.current[d.id],
        })),
        openedOrderRef.current,
      )
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
    delete openedOrderRef.current[id]
    saveOpenedOrder(openedOrderRef.current)
    setAllDocuments((prev) => prev.filter((r) => r.id !== id))
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }, [])

  /** Record that a document was just opened — bumps it to the top of 最近查看
      (and of the all-files list) immediately, persisting the order locally. */
  const markOpened = useCallback((id: string) => {
    openedOrderRef.current = { ...openedOrderRef.current, [id]: Date.now() }
    saveOpenedOrder(openedOrderRef.current)
    const bumpToFront = (list: FileRecord[]) => {
      const target = list.find((r) => r.id === id)
      if (!target) return list
      const updated = { ...target, openedAt: openedOrderRef.current[id] }
      return [updated, ...list.filter((r) => r.id !== id)]
    }
    setAllDocuments((prev) => bumpToFront(prev))
    setHistory((prev) => bumpToFront(prev))
  }, [])

  return {
    history,
    allDocuments,
    loading,
    addHistory,
    removeHistory,
    clearHistory,
    deleteDocument,
    markOpened,
    refresh: fetchHistory,
  }
}
