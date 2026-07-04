// Remote (Cloudflare Worker) API implementation.
//
// This module contains the original online implementation that used to live in
// api.ts. It is kept separate so migration helpers (api-migration.ts) can call
// the remote endpoints regardless of the current storage mode, and so api.ts
// can focus on dispatching between local and remote.

import { getDeviceId } from './device-id'
import { getRemoteApiBase } from './storage-mode'
import type { DocumentRecord, ShareRecord, ShareInfo } from './api-types'

// In a browser/Vite dev, '/api' is proxied by vite.config.ts. In Tauri remote
// mode there is no origin, so fall back to the configured remote Worker base.
const BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? '/api' : getRemoteApiBase())

// Simple in-memory cache for GET requests to reduce repeated API calls.
const cache = new Map<string, { data: unknown; expires: number }>()
const CACHE_TTL = 30_000 // 30 seconds

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isGet = !init?.method || init.method === 'GET'
  const cacheKey = isGet ? path : ''

  if (cacheKey) {
    const hit = cache.get(cacheKey)
    if (hit && hit.expires > Date.now()) {
      return hit.data as T
    }
  }

  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  const data = await res.json() as T

  if (cacheKey) {
    cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL })
  }

  return data
}

/** Invalidate cached GET responses that match a path prefix. */
function invalidateCache(prefix: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

// Device
export async function registerDevice() {
  const deviceId = getDeviceId()
  return request<{ deviceId: string; email: string | null }>('/device/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  })
}

// Documents
export async function uploadDocument(file: File, extractedText?: string) {
  const deviceId = getDeviceId()
  const formData = new FormData()
  formData.append('file', file)
  formData.append('deviceId', deviceId)
  if (extractedText) {
    formData.append('extractedText', extractedText)
  }

  const result = await request<{ id: string; name: string; size: number; category: string; r2Key: string }>(
    '/documents/upload',
    { method: 'POST', body: formData }
  )
  invalidateCache('/documents')
  return result
}

export async function listDocuments() {
  const deviceId = getDeviceId()
  return request<DocumentRecord[]>(`/documents?deviceId=${encodeURIComponent(deviceId)}`)
}

export async function deleteDocument(docId: string) {
  const deviceId = getDeviceId()
  const result = await request<{ success: true }>(`/documents/${docId}?deviceId=${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  })
  invalidateCache('/documents')
  return result
}

export async function downloadDocument(
  docId: string,
  onProgress?: (loaded: number, total: number) => void,
  expectedSize?: number,
): Promise<Blob> {
  const deviceId = getDeviceId()
  const res = await fetch(`${BASE}/documents/${docId}/download?deviceId=${encodeURIComponent(deviceId)}`)
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`)
  }

  if (!res.body) {
    return res.blob()
  }

  const contentLength = Number(res.headers.get('Content-Length')) || expectedSize || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress?.(loaded, contentLength)
  }

  return new Blob(chunks as BlobPart[], { type: res.headers.get('Content-Type') ?? 'application/octet-stream' })
}

export async function getDocumentText(docId: string): Promise<string | null> {
  return request<{ text: string | null }>(`/documents/${docId}/text`)
    .then((r) => r.text)
    .catch(() => null)
}

export async function summarizeDocument(docId: string, text?: string) {
  return request<{ summary: string; cached: boolean }>(`/documents/${docId}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

export async function getSummary(docId: string) {
  return request<{ summary: string | null; model?: string; createdAt?: number }>(
    `/documents/${docId}/summary`
  )
}

// Account
export async function bindEmail(email: string) {
  const deviceId = getDeviceId()
  return request<{ message: string; cooldown?: number }>('/account/bind', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, email }),
  })
}

export async function verifyBind(email: string, code: string) {
  const deviceId = getDeviceId()
  return request<{ success: true; email: string }>('/account/bind/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, email, code }),
  })
}

export async function sendRecoverCode(email: string) {
  return request<{ message: string; cooldown?: number }>('/account/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export async function recoverAccount(email: string, code: string) {
  const deviceId = getDeviceId()
  return request<{ devices: string[]; documents: DocumentRecord[] }>('/account/recover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, email, code }),
  })
}

export async function getAccountInfo() {
  const deviceId = getDeviceId()
  return request<{ email: string | null }>(`/account/info?deviceId=${encodeURIComponent(deviceId)}`)
}

export async function unbindEmail() {
  const deviceId = getDeviceId()
  return request<{ success: true }>('/account/unbind', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  })
}

// Shares
export async function createShare(docId: string, expiresIn: string): Promise<ShareRecord> {
  const deviceId = getDeviceId()
  return request<ShareRecord>('/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId: docId, deviceId, expiresIn }),
  })
}

export async function listShares(docId: string): Promise<ShareRecord[]> {
  const deviceId = getDeviceId()
  return request<ShareRecord[]>(`/documents/${docId}/shares?deviceId=${encodeURIComponent(deviceId)}`)
}

export async function deleteShare(shareId: string): Promise<{ success: true }> {
  const deviceId = getDeviceId()
  return request<{ success: true }>(`/shares/${shareId}?deviceId=${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  })
}

export async function getShareInfo(token: string): Promise<ShareInfo> {
  return request<ShareInfo>(`/share/${token}/info`)
}

export async function getShareContent(token: string): Promise<Response> {
  const res = await fetch(`${BASE}/share/${token}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Request failed: ${res.status}`)
  }
  return res
}
