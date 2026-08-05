// Shared API type definitions used by both local and remote storage backends.

export interface DocumentRecord {
  id: string
  name: string
  size: number
  category: string
  created_at: number
}

export interface ShareRecord {
  id: string
  document_id: string
  expires_at: number
  view_count: number
  created_at: number
}

export interface ShareInfo {
  name: string
  category: string
  expiresAt: number
  viewCount: number
}
