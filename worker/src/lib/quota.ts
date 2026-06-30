import type { D1Database } from '@cloudflare/workers-types'

// ── 配额常量（改数字 → 重新部署即生效）──────────────────────

export const QUOTA = {
  MAX_FILE_SIZE: 50 * 1024 * 1024,   // 50MB per file
  MAX_STORAGE: 400 * 1024 * 1024,    // 400MB per device
  MAX_DOCUMENTS: 50,                  // per device
} as const

export const RATE_LIMITS = {
  upload:    { window: 60,   max: 5  },  // 5 次/分钟
  summarize: { window: 3600, max: 10 },  // 10 次/小时
} as const

// ── 配额检查（纯读，零额外写入）─────────────────────────────

export interface QuotaUsage {
  docCount: number
  storageUsed: number
}

export async function checkQuota(
  db: D1Database,
  deviceId: string,
): Promise<{ ok: true; usage: QuotaUsage } | { ok: false; reason: string; usage: QuotaUsage }> {
  const row = await db.prepare(
    'SELECT COUNT(*) as cnt, COALESCE(SUM(size), 0) as total FROM documents WHERE device_id = ?'
  ).bind(deviceId).first<{ cnt: number; total: number }>()

  const usage: QuotaUsage = {
    docCount: row?.cnt ?? 0,
    storageUsed: row?.total ?? 0,
  }

  if (usage.docCount >= QUOTA.MAX_DOCUMENTS) {
    return { ok: false, reason: '文档数量已达上限', usage }
  }
  if (usage.storageUsed >= QUOTA.MAX_STORAGE) {
    return { ok: false, reason: '存储空间已满', usage }
  }
  return { ok: true, usage }
}

// ── 限流（固定时间窗口）──────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number   // unix seconds when the current window expires
}

export async function checkRateLimit(
  db: D1Database,
  deviceId: string,
  endpoint: keyof typeof RATE_LIMITS,
): Promise<RateLimitResult> {
  const { window, max } = RATE_LIMITS[endpoint]
  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(now / window) * window
  const key = `${deviceId}:${endpoint}`

  // 读取当前窗口计数
  const row = await db.prepare(
    'SELECT count FROM rate_limits WHERE key = ? AND window_start = ?'
  ).bind(key, windowStart).first<{ count: number }>()

  const current = row?.count ?? 0

  if (current >= max) {
    return { allowed: false, remaining: 0, resetAt: windowStart + window }
  }

  // 递增计数（upsert）
  await db.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`
  ).bind(key, windowStart).run()

  return { allowed: true, remaining: max - current - 1, resetAt: windowStart + window }
}

// ── 随机清理过期窗口（1% 概率触发）──────────────────────────

export async function maybeCleanupRateLimits(db: D1Database): Promise<void> {
  if (Math.random() > 0.01) return
  const cutoff = Math.floor(Date.now() / 1000) - 7200 // 保留最近 2 小时
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(cutoff).run()
}
