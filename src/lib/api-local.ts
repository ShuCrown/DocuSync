// Local-first API implementation for Tauri desktop mode.
//
// Mirrors the export surface of ./api.ts but stores files on the local
// filesystem (via @tauri-apps/plugin-fs) and metadata in a local SQLite
// database (via @tauri-apps/plugin-sql). The browser path in ./api.ts is
// untouched — api.ts dispatches here only when isTauri() is true.
//
// AI summarization still calls the deployed Cloudflare Worker (Workers AI has
// no local equivalent). Account binding and sharing are disabled locally —
// data belongs to this machine, so there is nothing to bind or share.

import Database from '@tauri-apps/plugin-sql'
import { writeFile, readFile, remove, exists, mkdir } from '@tauri-apps/plugin-fs'
import { appDataDir, join, dirname } from '@tauri-apps/api/path'
import { getDeviceId } from './device-id'
import { getRemoteApiBase } from './storage-mode'
import { LOCAL_DB_NAME, LOCAL_SCHEMA_SQL } from './local-schema'
import type {
  DocumentRecord,
  ShareRecord,
  ShareInfo,
} from './api-types'

const LOCAL_NOT_SUPPORTED = '本地模式不支持此操作（账号绑定/分享需在线使用）'

// ---------------------------------------------------------------------------
// DB singleton + schema bootstrap
// ---------------------------------------------------------------------------

let dbPromise: Promise<Database> | null = null

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load(LOCAL_DB_NAME)
      await db.execute(LOCAL_SCHEMA_SQL)
      // Ensure the local device row exists (parity with remote registerDevice).
      const deviceId = getDeviceId()
      await db
        .execute('INSERT OR IGNORE INTO devices (id) VALUES (?)', [deviceId])
        .catch(() => undefined)
      return db
    })()
  }
  return dbPromise
}

// ---------------------------------------------------------------------------
// ID generation (mirrors device-id.ts, avoids pulling nanoid into the bundle)
// ---------------------------------------------------------------------------

function generateId(len = 21): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let id = ''
  for (let i = 0; i < bytes.length; i++) {
    id += chars[bytes[i] % chars.length]
  }
  return id
}

// ---------------------------------------------------------------------------
// File path helpers — stored relative to appDataDir, resolved at access time.
// ---------------------------------------------------------------------------

const FILES_DIR = 'docusync/files'

async function resolveAbs(relPath: string): Promise<string> {
  return join(await appDataDir(), relPath)
}

function buildRelPath(deviceId: string, docId: string, ext: string): string {
  return `${FILES_DIR}/${deviceId}/${docId}.${ext}`
}

async function ensureDirFor(relPath: string): Promise<void> {
  const abs = await resolveAbs(relPath)
  // Use dirname() instead of string slicing: on Windows, join() produces
  // backslash paths and lastIndexOf('/') returns -1, yielding an empty dir
  // that mkdir rejects with "forbidden path:".
  const dir = await dirname(abs)
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Category detection (shared with the Worker implementation)
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, string> = {
  '.pdf': 'pdf', '.md': 'markdown', '.markdown': 'markdown',
  '.doc': 'word', '.docx': 'word', '.xls': 'excel', '.xlsx': 'excel',
  '.ppt': 'powerpoint', '.pptx': 'powerpoint',
}

function detectCategory(fileName: string): string {
  const name = fileName.toLowerCase()
  const dotIdx = name.lastIndexOf('.')
  const ext = dotIdx !== -1 ? name.slice(dotIdx) : ''
  return CATEGORY_MAP[ext] ?? 'unknown'
}

// ---------------------------------------------------------------------------
// Device
// ---------------------------------------------------------------------------

export async function registerDevice() {
  await getDb()
  return { deviceId: getDeviceId(), email: null }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function uploadDocument(file: File, extractedText?: string) {
  let db: Database
  try {
    db = await getDb()
  } catch (err) {
    throw new Error(`数据库初始化失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  const deviceId = getDeviceId()
  const docId = generateId(21)
  const ext = file.name.split('.').pop() || 'bin'
  const relPath = buildRelPath(deviceId, docId, ext)

  try {
    await ensureDirFor(relPath)
  } catch (err) {
    throw new Error(`创建目录失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  const abs = await resolveAbs(relPath)

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (err) {
    throw new Error(`读取文件内容失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    await writeFile(abs, bytes)
  } catch (err) {
    throw new Error(`写入文件失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  const category = detectCategory(file.name)
  try {
    await db.execute(
      'INSERT INTO documents (id, device_id, name, size, category, r2_key, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [docId, deviceId, file.name, file.size, category, relPath, extractedText ?? null],
    )
  } catch (err) {
    throw new Error(`保存文档记录失败: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { id: docId, name: file.name, size: file.size, category, r2Key: relPath }
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const db = await getDb()
  const deviceId = getDeviceId()
  const rows = await db.select<DocumentRecord[]>(
    'SELECT id, name, size, category, created_at FROM documents WHERE device_id = ? ORDER BY created_at DESC LIMIT 50',
    [deviceId],
  )
  return rows ?? []
}

export async function deleteDocument(docId: string) {
  const db = await getDb()
  const deviceId = getDeviceId()
  const row = await db.select<{ r2_key: string }[]>(
    'SELECT r2_key FROM documents WHERE id = ? AND device_id = ?',
    [docId, deviceId],
  )
  const relPath = row[0]?.r2_key
  if (relPath) {
    const abs = await resolveAbs(relPath)
    await remove(abs).catch(() => undefined)
  }
  await db.execute('DELETE FROM documents WHERE id = ?', [docId])
  return { success: true as const }
}

export async function downloadDocument(
  docId: string,
  onProgress?: (loaded: number, total: number) => void,
  _expectedSize?: number,
): Promise<Blob> {
  const db = await getDb()
  const deviceId = getDeviceId()
  const row = await db.select<{ r2_key: string; name: string }[]>(
    'SELECT r2_key, name FROM documents WHERE id = ? AND device_id = ?',
    [docId, deviceId],
  )
  const doc = row[0]
  if (!doc) throw new Error('Document not found')

  const abs = await resolveAbs(doc.r2_key)
  const bytes = await readFile(abs)
  const blob = new Blob([bytes], { type: 'application/octet-stream' })
  onProgress?.(bytes.length, bytes.length)
  return blob
}

export async function getDocumentText(docId: string): Promise<string | null> {
  const db = await getDb()
  const row = await db.select<{ extracted_text: string | null }[]>(
    'SELECT extracted_text FROM documents WHERE id = ? AND device_id = ?',
    [docId, getDeviceId()],
  )
  return row[0]?.extracted_text ?? null
}

// ---------------------------------------------------------------------------
// Summarize — cache locally, generate via remote Worker (no local LLM)
// ---------------------------------------------------------------------------

export async function summarizeDocument(docId: string, text?: string) {
  const db = await getDb()

  // 1. Local cache hit?
  const cached = await db.select<{ content: string }[]>(
    'SELECT content FROM summaries WHERE document_id = ? ORDER BY created_at DESC LIMIT 1',
    [docId],
  )
  if (cached[0]?.content) {
    return { summary: cached[0].content, cached: true }
  }

  // 2. Resolve text: caller-provided, else from the local documents row.
  let inputText = text
  if (!inputText) {
    const docRow = await db.select<{ extracted_text: string | null }[]>(
      'SELECT extracted_text FROM documents WHERE id = ?',
      [docId],
    )
    inputText = docRow[0]?.extracted_text ?? ''
  }
  if (!inputText.trim()) {
    throw new Error('无法提取文档文本内容')
  }

  const maxChars = 12000
  const truncated =
    inputText.length > maxChars
      ? inputText.slice(0, maxChars) + '\n\n[内容已截断...]'
      : inputText

  // 3. Call the deployed Worker. The remote endpoint accepts `text` in the
  //    body and uses it directly when the document isn't in its D1, so local
  //    docIds work fine. The remote cache will simply miss.
  const res = await fetch(`${getRemoteApiBase()}/documents/${docId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: truncated }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  const data = await res.json() as { summary: string }

  // 4. Cache locally.
  const summaryId = generateId(21)
  await db.execute(
    'INSERT INTO summaries (id, document_id, content, model) VALUES (?, ?, ?, ?)',
    [summaryId, docId, data.summary, 'remote-worker'],
  )

  return { summary: data.summary, cached: false }
}

export async function getSummary(docId: string) {
  const db = await getDb()
  const row = await db.select<{ content: string; model: string; created_at: number }[]>(
    'SELECT content, model, created_at FROM summaries WHERE document_id = ? ORDER BY created_at DESC LIMIT 1',
    [docId],
  )
  if (!row[0]) return { summary: null }
  return {
    summary: row[0].content,
    model: row[0].model,
    createdAt: row[0].created_at,
  }
}

// ---------------------------------------------------------------------------
// Account — disabled in local mode (data is inherently bound to this machine)
// ---------------------------------------------------------------------------

export async function getAccountInfo() {
  return { email: null }
}

export async function bindEmail(_email: string): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function verifyBind(_email: string, _code: string): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function sendRecoverCode(_email: string): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function recoverAccount(_email: string, _code: string): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function unbindEmail(): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}

// ---------------------------------------------------------------------------
// Shares — disabled in local mode (no public endpoint to serve from)
// ---------------------------------------------------------------------------

export async function createShare(_docId: string, _expiresIn: string): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function listShares(_docId: string): Promise<ShareRecord[]> {
  return []
}
export async function deleteShare(_shareId: string): Promise<never> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function getShareInfo(_token: string): Promise<ShareInfo> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
export async function getShareContent(_token: string): Promise<Response> {
  throw new Error(LOCAL_NOT_SUPPORTED)
}
