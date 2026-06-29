-- 设备表
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 文档表
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

-- 验证码表（邮箱绑定/找回）
CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_vcodes_email ON verification_codes(email, purpose, used);

-- 分享链接表
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  max_views INTEGER,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(id);
CREATE INDEX IF NOT EXISTS idx_shares_document ON shares(document_id);
