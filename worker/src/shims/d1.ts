/**
 * D1Database compatibility shim over better-sqlite3.
 *
 * Wraps better-sqlite3 to match the Cloudflare D1 API surface used by the
 * worker: prepare().bind().first/all/run(). Only the methods actually called
 * in index.ts are implemented — add more if the main branch introduces them.
 */

import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Types matching the D1 API subset we use
// ---------------------------------------------------------------------------

interface D1Meta {
  served_by: string
  duration: number
  changes: number
  last_row_id: number
  rows_read: number
  rows_written: number
}

interface D1Result<T> {
  results: T[]
  success: boolean
  meta: D1Meta
}

interface D1ExecResult {
  count: number
  duration: number
}

// ---------------------------------------------------------------------------
// Prepared statement wrapper
// ---------------------------------------------------------------------------

class D1PreparedStatement {
  private boundParams: unknown[]

  constructor(
    private stmt: Database.Statement,
    params: unknown[] = [],
  ) {
    this.boundParams = params
  }

  bind(...params: unknown[]): D1PreparedStatement {
    return new D1PreparedStatement(this.stmt, params)
  }

  first<T extends Record<string, unknown> = Record<string, unknown>>(
    colName?: string,
  ): Promise<T | null> {
    const row = this.stmt.get(...this.boundParams) as T | undefined
    if (!row) return Promise.resolve(null)
    if (colName && colName in row) return Promise.resolve(row[colName] as unknown as T)
    return Promise.resolve(row)
  }

  all<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<D1Result<T>> {
    const rows = this.stmt.all(...this.boundParams) as T[]
    return Promise.resolve({
      results: rows,
      success: true,
      meta: this.emptyMeta(),
    })
  }

  run(): Promise<D1Result<never>> {
    const info = this.stmt.run(...this.boundParams)
    return Promise.resolve({
      results: [],
      success: true,
      meta: {
        ...this.emptyMeta(),
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    })
  }

  private emptyMeta(): D1Meta {
    return {
      served_by: 'better-sqlite3-shim',
      duration: 0,
      changes: 0,
      last_row_id: 0,
      rows_read: 0,
      rows_written: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// Database wrapper
// ---------------------------------------------------------------------------

export class D1Shim {
  private db: Database.Database

  constructor(dbPath: string) {
    // Ensure parent directory exists
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  prepare(sql: string): D1PreparedStatement {
    const stmt = this.db.prepare(sql)
    return new D1PreparedStatement(stmt)
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = []
    const transaction = this.db.transaction(() => {
      for (const stmt of statements) {
        // Each statement in a D1 batch is a full prepare-bind-run cycle.
        // Our D1PreparedStatement already holds the bound params, so we just run.
        const result = (stmt as unknown as { run: () => Promise<D1Result<never>> }).run()
        // Transaction is synchronous in better-sqlite3, but our run() returns a Promise.
        // We need to handle this carefully — batch is not currently used by index.ts,
        // so this is a best-effort implementation.
        results.push(result as unknown as D1Result<T>)
      }
    })
    transaction()
    return Promise.resolve(results)
  }

  exec(sql: string): Promise<D1ExecResult> {
    this.db.exec(sql)
    return Promise.resolve({ count: 0, duration: 0 })
  }

  /** Initialize schema from a SQL file. Safe to call on every startup. */
  initSchema(schemaPath: string): void {
    if (!fs.existsSync(schemaPath)) {
      console.warn(`[d1-shim] Schema file not found: ${schemaPath}`)
      return
    }
    const sql = fs.readFileSync(schemaPath, 'utf-8')
    this.db.exec(sql)
    console.log(`[d1-shim] Schema initialized from ${schemaPath}`)
  }

  close(): void {
    this.db.close()
  }
}
