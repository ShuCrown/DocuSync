/**
 * Node.js entry point for Docker deployment.
 *
 * This file is the ONLY addition needed to run the worker outside
 * Cloudflare. It imports the existing Hono app (zero modifications)
 * and wires up D1/R2/AI compatibility shims.
 *
 * The original worker/src/index.ts is NOT modified.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import app from './index'
import { D1Shim } from './shims/d1'
import { R2Shim } from './shims/r2'
import { AIShim } from './shims/ai'

// ---------------------------------------------------------------------------
// Resolve paths (works whether running from source or bundled)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = path.resolve(__dirname, 'db/schema.sql')

// ---------------------------------------------------------------------------
// Config from environment
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000)
const DB_PATH = process.env.DB_PATH ?? '/data/db/docusync.sqlite'
const FILES_DIR = process.env.FILES_DIR ?? '/data/files'

// ---------------------------------------------------------------------------
// Initialize shims
// ---------------------------------------------------------------------------

console.log(`[entry] DB_PATH   = ${DB_PATH}`)
console.log(`[entry] FILES_DIR = ${FILES_DIR}`)

const db = new D1Shim(DB_PATH)
const bucket = new R2Shim(FILES_DIR)
const ai = new AIShim()

// Run schema migration on startup
db.initSchema(SCHEMA_PATH)

// ---------------------------------------------------------------------------
// Bindings object — matches the Bindings interface in index.ts
// ---------------------------------------------------------------------------

const bindings = {
  DB: db as unknown as D1Database,
  FILES_BUCKET: bucket as unknown as R2Bucket,
  AI: ai as unknown as Ai,
  MAIL_SERVICE_URL: process.env.MAIL_SERVICE_URL,
  MAIL_SERVICE_KEY: process.env.MAIL_SERVICE_KEY,
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

serve(
  {
    fetch: (req) => app.fetch(req, bindings),
    port: PORT,
  },
  (info) => {
    console.log(`[entry] DocuSync API running on http://localhost:${info.port}`)
  },
)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[entry] Shutting down...')
  db.close()
  process.exit(0)
})
process.on('SIGTERM', () => {
  console.log('[entry] Shutting down...')
  db.close()
  process.exit(0)
})
