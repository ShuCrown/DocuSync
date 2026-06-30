import { useState, useCallback, useRef } from 'react'

const DB_NAME = 'docusync-local'
const DB_VERSION = 1
const STORE_FILES = 'files'
const STORE_HISTORY = 'history'

export interface LocalFileRecord {
  id: string
  name: string
  size: number
  category: string
  timestamp: number
}

// --- Thin IndexedDB wrapper (no external dependency) ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES)
      if (!db.objectStoreNames.contains(STORE_HISTORY)) db.createObjectStore(STORE_HISTORY, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const s = tx.objectStore(store)
    const req = key !== undefined ? s.put(value, key) : s.put(value)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// --- Public API ---

export async function storeLocalFile(id: string, blob: Blob): Promise<void> {
  const db = await openDB()
  await idbPut(db, STORE_FILES, blob, id)
  db.close()
}

export async function readLocalFile(id: string): Promise<Blob | undefined> {
  const db = await openDB()
  const blob = await idbGet<Blob>(db, STORE_FILES, id)
  db.close()
  return blob
}

export async function deleteLocalFile(id: string): Promise<void> {
  const db = await openDB()
  await idbDelete(db, STORE_FILES, id)
  db.close()
}

export async function saveHistoryRecord(record: LocalFileRecord): Promise<void> {
  const db = await openDB()
  await idbPut(db, STORE_HISTORY, record)
  db.close()
}

export async function loadAllHistory(): Promise<LocalFileRecord[]> {
  const db = await openDB()
  const records = await idbGetAll<LocalFileRecord>(db, STORE_HISTORY)
  db.close()
  return records.sort((a, b) => b.timestamp - a.timestamp)
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  const db = await openDB()
  await idbDelete(db, STORE_HISTORY, id)
  await idbDelete(db, STORE_FILES, id)
  db.close()
}

/** Hook: local file history for private mode. */
export function useLocalHistory() {
  const [history, setHistory] = useState<LocalFileRecord[]>([])
  const initialized = useRef<boolean | null>(null)

  // Load history on mount (once)
  if (initialized.current == null) {
    initialized.current = true
    loadAllHistory().then(setHistory)
  }

  const refresh = useCallback(async () => {
    const records = await loadAllHistory()
    setHistory(records)
  }, [])

  const add = useCallback(async (file: File, category: string) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    await storeLocalFile(id, file)
    const record: LocalFileRecord = { id, name: file.name, size: file.size, category, timestamp: Date.now() }
    await saveHistoryRecord(record)
    setHistory((prev) => [record, ...prev])
    return id
  }, [])

  const remove = useCallback(async (id: string) => {
    await deleteHistoryRecord(id)
    setHistory((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const clear = useCallback(async () => {
    const db = await openDB()
    await idbClear(db, STORE_FILES)
    await idbClear(db, STORE_HISTORY)
    db.close()
    setHistory([])
  }, [])

  const restoreFile = useCallback(async (record: LocalFileRecord): Promise<File | null> => {
    const blob = await readLocalFile(record.id)
    if (!blob) return null
    return new File([blob], record.name, { type: blob.type })
  }, [])

  return { history, add, remove, clear, restoreFile, refresh }
}
