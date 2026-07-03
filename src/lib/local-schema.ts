// Local SQLite schema for Tauri desktop mode.
//
// Mirrors worker/src/db/schema.sql so the data model stays in sync with the
// Cloudflare D1 backend. Only the tables that make sense for a single-device
// local app are kept; verification_codes / rate_limits are backend-only and
// omitted here.

export const LOCAL_DB_NAME = 'sqlite:docusync.db'

export const LOCAL_SCHEMA_SQL = `
-- 设备表（本地单设备，仅保留 id/email 字段以兼容现有代码）
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 文档表（r2_key 列复用，存储相对 appData 的本地文件路径）
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  category TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  extracted_text TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_documents_device ON documents(device_id, created_at DESC);

-- 摘要缓存表
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summaries_document ON summaries(document_id);
`
