// Bidirectional data migration between local (Tauri/SQLite) and remote
// (Cloudflare Worker) storage backends.
//
// These helpers are intentionally decoupled from the current storage mode so
// a user can migrate data in either direction regardless of which mode is
// active. They are only callable from the Tauri desktop build because the
// local backend requires Tauri fs/sql plugins.

import * as local from './api-local'
import * as remote from './api-remote'
import type { DocumentRecord } from './api-types'

export interface MigrationOptions {
  /** Called after each document is processed. */
  onProgress?: (progress: MigrationProgress) => void
  /** Skip documents whose name + size already exist on the destination. */
  skipIfSameNameAndSize?: boolean
  abortSignal?: AbortSignal
}

export interface MigrationProgress {
  direction: 'local-to-remote' | 'remote-to-local'
  /** 1-based index of the document currently being processed. */
  current: number
  total: number
  currentName: string
  status: 'running' | 'done' | 'error'
  error?: string
}

export interface MigrationResult {
  direction: 'local-to-remote' | 'remote-to-local'
  total: number
  success: number
  failed: number
  skipped: number
  errors: Array<{ name: string; error: string }>
}

type Direction = MigrationProgress['direction']

function report(
  opts: MigrationOptions,
  direction: Direction,
  current: number,
  total: number,
  currentName: string,
  status: MigrationProgress['status'],
  error?: string,
) {
  opts.onProgress?.({ direction, current, total, currentName, status, error })
}

function fileFromBlob(blob: Blob, name: string): File {
  return new File([blob], name, { type: blob.type || 'application/octet-stream' })
}

function buildDedupKey(doc: DocumentRecord): string {
  return `${doc.name}\0${doc.size}`
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('迁移已取消')
  }
}

async function runMigration(
  direction: Direction,
  sourceList: () => Promise<DocumentRecord[]>,
  destList: () => Promise<DocumentRecord[]>,
  transfer: (doc: DocumentRecord) => Promise<void>,
  opts: MigrationOptions,
): Promise<MigrationResult> {
  const result: MigrationResult = {
    direction,
    total: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  checkAbort(opts.abortSignal)

  const [sourceDocs, destDocs] = await Promise.all([sourceList(), destList()])
  const destKeys = new Set(opts.skipIfSameNameAndSize ? destDocs.map(buildDedupKey) : [])

  result.total = sourceDocs.length

  for (let i = 0; i < sourceDocs.length; i++) {
    checkAbort(opts.abortSignal)

    const doc = sourceDocs[i]
    const current = i + 1

    if (destKeys.has(buildDedupKey(doc))) {
      result.skipped++
      report(opts, direction, current, result.total, doc.name, 'done')
      continue
    }

    report(opts, direction, current, result.total, doc.name, 'running')

    try {
      await transfer(doc)
      result.success++
      report(opts, direction, current, result.total, doc.name, 'done')
    } catch (err) {
      const message = err instanceof Error ? err.message : '迁移失败'
      result.failed++
      result.errors.push({ name: doc.name, error: message })
      report(opts, direction, current, result.total, doc.name, 'error', message)
    }
  }

  return result
}

/** Migrate all documents from local storage to the remote Worker. */
export async function migrateLocalToRemote(opts: MigrationOptions = {}): Promise<MigrationResult> {
  return runMigration(
    'local-to-remote',
    () => local.listDocuments(),
    () => remote.listDocuments(),
    async (doc) => {
      const [blob, text] = await Promise.all([
        local.downloadDocument(doc.id),
        local.getDocumentText(doc.id),
      ])
      const file = fileFromBlob(blob, doc.name)
      await remote.uploadDocument(file, text ?? undefined)
    },
    opts,
  )
}

/** Migrate all documents from the remote Worker to local storage. */
export async function migrateRemoteToLocal(opts: MigrationOptions = {}): Promise<MigrationResult> {
  return runMigration(
    'remote-to-local',
    () => remote.listDocuments(),
    () => local.listDocuments(),
    async (doc) => {
      const [blob, text] = await Promise.all([
        remote.downloadDocument(doc.id),
        remote.getDocumentText(doc.id),
      ])
      const file = fileFromBlob(blob, doc.name)
      await local.uploadDocument(file, text ?? undefined)
    },
    opts,
  )
}
