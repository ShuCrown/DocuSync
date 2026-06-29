import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { nanoid } from 'nanoid'
import { sendBindEmail, sendRecoveryEmail } from './lib/mailer'

export interface Bindings {
  FILES_BUCKET: R2Bucket
  AI: Ai
  DB: D1Database
  MAIL_SERVICE_URL?: string
  MAIL_SERVICE_KEY?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'docusync-api' }))

// ============================================================
// Device
// ============================================================

// POST /api/device/register
app.post('/api/device/register', async (c) => {
  const body = await c.req.json<{ deviceId?: string }>()
  const { deviceId } = body

  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const existing = await c.env.DB.prepare(
    'SELECT id, email FROM devices WHERE id = ?'
  ).bind(deviceId).first<{ id: string; email: string | null }>()

  if (existing) {
    return c.json({ deviceId: existing.id, email: existing.email })
  }

  await c.env.DB.prepare(
    'INSERT INTO devices (id) VALUES (?)'
  ).bind(deviceId).run()

  return c.json({ deviceId, email: null })
})

// ============================================================
// Documents
// ============================================================

// POST /api/documents/upload
app.post('/api/documents/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file')
  const deviceId = formData.get('deviceId')
  const extractedText = formData.get('extractedText') as string | null

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400)
  }
  if (!deviceId || typeof deviceId !== 'string') {
    return c.json({ error: 'deviceId required' }, 400)
  }

  // Ensure device exists
  const device = await c.env.DB.prepare(
    'SELECT id FROM devices WHERE id = ?'
  ).bind(deviceId).first()
  if (!device) {
    await c.env.DB.prepare('INSERT INTO devices (id) VALUES (?)').bind(deviceId).run()
  }

  const docId = nanoid(21)
  const ext = file.name.split('.').pop() ?? 'bin'
  const r2Key = `docusync/${deviceId}/${docId}.${ext}`

  // Upload to R2
  await c.env.FILES_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalName: file.name, deviceId },
  })

  // Detect category
  const name = file.name.toLowerCase()
  const dotIdx = name.lastIndexOf('.')
  const extension = dotIdx !== -1 ? name.slice(dotIdx) : ''
  const categoryMap: Record<string, string> = {
    '.pdf': 'pdf', '.md': 'markdown', '.markdown': 'markdown',
    '.doc': 'word', '.docx': 'word', '.xls': 'excel', '.xlsx': 'excel',
    '.ppt': 'powerpoint', '.pptx': 'powerpoint',
  }
  const category = categoryMap[extension] ?? 'unknown'

  // Save to D1
  await c.env.DB.prepare(
    'INSERT INTO documents (id, device_id, name, size, category, r2_key, extracted_text) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(docId, deviceId, file.name, file.size, category, r2Key, extractedText ?? null).run()

  return c.json({ id: docId, name: file.name, size: file.size, category, r2Key })
})

// GET /api/documents?deviceId=xxx
app.get('/api/documents', async (c) => {
  const deviceId = c.req.query('deviceId')
  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const { results } = await c.env.DB.prepare(
    'SELECT id, name, size, category, created_at FROM documents WHERE device_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(deviceId).all<{ id: string; name: string; size: number; category: string; created_at: number }>()

  return c.json(results)
})

// DELETE /api/documents/:id
app.delete('/api/documents/:id', async (c) => {
  const docId = c.req.param('id')
  const deviceId = c.req.query('deviceId')
  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const doc = await c.env.DB.prepare(
    'SELECT id, r2_key FROM documents WHERE id = ? AND device_id = ?'
  ).bind(docId, deviceId).first<{ id: string; r2_key: string }>()

  if (!doc) {
    return c.json({ error: 'Document not found' }, 404)
  }

  // Delete from R2
  await c.env.FILES_BUCKET.delete(doc.r2_key)

  // Delete from D1 (summaries cascade)
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run()

  return c.json({ success: true })
})

// GET /api/documents/:id/download
app.get('/api/documents/:id/download', async (c) => {
  const docId = c.req.param('id')
  const deviceId = c.req.query('deviceId')
  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const doc = await c.env.DB.prepare(
    'SELECT r2_key, name FROM documents WHERE id = ? AND device_id = ?'
  ).bind(docId, deviceId).first<{ r2_key: string; name: string }>()

  if (!doc) {
    return c.json({ error: 'Document not found' }, 404)
  }

  const obj = await c.env.FILES_BUCKET.get(doc.r2_key)
  if (!obj) {
    return c.json({ error: 'File not found in storage' }, 404)
  }

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.name)}"`,
      'Content-Length': String(obj.size),
    },
  })
})

// ============================================================
// Summarize (with D1 cache)
// ============================================================

const SYSTEM_PROMPT = `你是一个专业的文档分析助手。请对以下文档内容进行要点总结，要求：
1. 提炼核心主题和关键信息
2. 使用清晰的层次结构（标题 + 要点列表）
3. 保持简洁，突出重点
4. 使用中文回复`

// POST /api/documents/:id/summarize
app.post('/api/documents/:id/summarize', async (c) => {
  const docId = c.req.param('id')
  const body = await c.req.json<{ text?: string }>().catch(() => ({ text: undefined }))
  const inputText = body.text

  // Check cache first
  const cached = await c.env.DB.prepare(
    'SELECT content FROM summaries WHERE document_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(docId).first<{ content: string }>()

  if (cached) {
    return c.json({ summary: cached.content, cached: true })
  }

  // Get text from body or from document record
  let text = inputText
  if (!text) {
    const doc = await c.env.DB.prepare(
      'SELECT extracted_text FROM documents WHERE id = ?'
    ).bind(docId).first<{ extracted_text: string | null }>()
    text = doc?.extracted_text ?? ''
  }

  if (!text?.trim()) {
    return c.json({ error: '无法提取文档文本内容' }, 400)
  }

  // Truncate to fit model limits
  const maxChars = 12000
  const truncated = text.length > maxChars
    ? text.slice(0, maxChars) + '\n\n[内容已截断...]'
    : text

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: `请总结以下文档内容：\n\n${truncated}` },
  ]

  try {
    const response = await c.env.AI.run(
      '@cf/meta/llama-3.2-3b-instruct',
      { messages, max_tokens: 1024 }
    )

    const summary = response instanceof Object && 'response' in response
      ? (response as { response: string }).response
      : String(response)

    // Cache in D1
    const summaryId = nanoid(21)
    await c.env.DB.prepare(
      'INSERT INTO summaries (id, document_id, content, model) VALUES (?, ?, ?, ?)'
    ).bind(summaryId, docId, summary, '@cf/meta/llama-3.2-3b-instruct').run()

    return c.json({ summary, cached: false })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500
    )
  }
})

// GET /api/documents/:id/summary
app.get('/api/documents/:id/summary', async (c) => {
  const docId = c.req.param('id')

  const cached = await c.env.DB.prepare(
    'SELECT content, model, created_at FROM summaries WHERE document_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(docId).first<{ content: string; model: string; created_at: number }>()

  if (!cached) {
    return c.json({ summary: null })
  }

  return c.json({ summary: cached.content, model: cached.model, createdAt: cached.created_at })
})

// ============================================================
// Account (email bind / recover)
// ============================================================

const CODE_EXPIRY_SECONDS = 10 * 60
const RATE_LIMIT_SECONDS = 60

function generateCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(100000 + (arr[0] % 900000))
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// POST /api/account/bind
app.post('/api/account/bind', async (c) => {
  const body = await c.req.json<{ deviceId?: string; email?: string }>()
  const { deviceId, email } = body

  if (!deviceId || !email) {
    return c.json({ error: '缺少必要参数' }, 400)
  }
  if (!isValidEmail(email)) {
    return c.json({ error: '请输入有效的邮箱地址' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Check if already bound
  const device = await c.env.DB.prepare(
    'SELECT email FROM devices WHERE id = ?'
  ).bind(deviceId).first<{ email: string | null }>()

  if (device?.email) {
    return c.json({ error: '该设备已绑定邮箱' }, 409)
  }

  const now = Math.floor(Date.now() / 1000)

  // Rate limit: check existing code
  const existingCode = await c.env.DB.prepare(
    'SELECT id, created_at FROM verification_codes WHERE device_id = ? AND email = ? AND purpose = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind(deviceId, normalizedEmail, 'bind', now).first<{ id: string; created_at: number }>()

  if (existingCode) {
    const elapsed = now - existingCode.created_at
    if (elapsed < RATE_LIMIT_SECONDS) {
      return c.json({ message: '验证码已发送，请查看邮箱', cooldown: RATE_LIMIT_SECONDS - elapsed })
    }
    await c.env.DB.prepare('DELETE FROM verification_codes WHERE id = ?').bind(existingCode.id).run()
  }

  const code = generateCode()
  const codeId = nanoid(21)

  await c.env.DB.prepare(
    'INSERT INTO verification_codes (id, device_id, email, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(codeId, deviceId, normalizedEmail, code, 'bind', now + CODE_EXPIRY_SECONDS).run()

  try {
    await sendBindEmail(c.env, normalizedEmail, code)
  } catch (err) {
    console.error('[bind] Failed to send email:', err)
    return c.json({ error: '邮件发送失败，请稍后重试' }, 502)
  }

  return c.json({ message: '验证码已发送，请查看邮箱' })
})

// POST /api/account/bind/verify
app.post('/api/account/bind/verify', async (c) => {
  const body = await c.req.json<{ deviceId?: string; email?: string; code?: string }>()
  const { deviceId, email, code } = body

  if (!deviceId || !email || !code) {
    return c.json({ error: '缺少必要参数' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()
  const now = Math.floor(Date.now() / 1000)

  const codeRecord = await c.env.DB.prepare(
    `SELECT id FROM verification_codes
     WHERE device_id = ? AND email = ? AND code = ? AND purpose = 'bind' AND used = 0 AND expires_at > ?`
  ).bind(deviceId, normalizedEmail, code, now).first<{ id: string }>()

  if (!codeRecord) {
    return c.json({ error: '验证码无效或已过期' }, 400)
  }

  // Bind email to device
  await c.env.DB.prepare(
    'UPDATE devices SET email = ? WHERE id = ?'
  ).bind(normalizedEmail, deviceId).run()

  // Mark code used
  await c.env.DB.prepare(
    'UPDATE verification_codes SET used = 1 WHERE id = ?'
  ).bind(codeRecord.id).run()

  return c.json({ success: true, email: normalizedEmail })
})

// POST /api/account/recover
app.post('/api/account/recover', async (c) => {
  const body = await c.req.json<{ deviceId?: string; email?: string; code?: string }>()
  const { deviceId, email, code } = body

  if (!deviceId || !email || !code) {
    return c.json({ error: '缺少必要参数' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()
  const now = Math.floor(Date.now() / 1000)

  const codeRecord = await c.env.DB.prepare(
    `SELECT id FROM verification_codes
     WHERE email = ? AND code = ? AND purpose = 'recover' AND used = 0 AND expires_at > ?`
  ).bind(normalizedEmail, code, now).first<{ id: string }>()

  if (!codeRecord) {
    return c.json({ error: '验证码无效或已过期' }, 400)
  }

  // Find all devices bound to this email
  const { results: devices } = await c.env.DB.prepare(
    'SELECT id FROM devices WHERE email = ?'
  ).bind(normalizedEmail).all<{ id: string }>()

  if (devices.length === 0) {
    return c.json({ error: '未找到关联设备' }, 404)
  }

  // Collect all documents from all bound devices
  const deviceIds = devices.map((d) => d.id)
  const placeholders = deviceIds.map(() => '?').join(',')
  const { results: documents } = await c.env.DB.prepare(
    `SELECT id, name, size, category, created_at FROM documents
     WHERE device_id IN (${placeholders})
     ORDER BY created_at DESC LIMIT 100`
  ).bind(...deviceIds).all<{ id: string; name: string; size: number; category: string; created_at: number }>()

  // Bind email to current device if not already
  const currentDevice = await c.env.DB.prepare(
    'SELECT email FROM devices WHERE id = ?'
  ).bind(deviceId).first<{ email: string | null }>()

  if (!currentDevice?.email) {
    // Ensure device exists
    if (!currentDevice) {
      await c.env.DB.prepare('INSERT INTO devices (id, email) VALUES (?, ?)').bind(deviceId, normalizedEmail).run()
    } else {
      await c.env.DB.prepare('UPDATE devices SET email = ? WHERE id = ?').bind(normalizedEmail, deviceId).run()
    }
  }

  // Mark code used
  await c.env.DB.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').bind(codeRecord.id).run()

  return c.json({ devices: deviceIds, documents })
})

// POST /api/account/login (send recovery code)
app.post('/api/account/login', async (c) => {
  const body = await c.req.json<{ email?: string }>()
  const { email } = body

  if (!email || !isValidEmail(email)) {
    return c.json({ error: '请输入有效的邮箱地址' }, 400)
  }

  const normalizedEmail = email.toLowerCase().trim()

  // Check if any device has this email
  const account = await c.env.DB.prepare(
    'SELECT id FROM devices WHERE email = ?'
  ).bind(normalizedEmail).first()

  if (!account) {
    return c.json({ message: '如果该邮箱已绑定，您将收到验证码' })
  }

  const now = Math.floor(Date.now() / 1000)

  const existingCode = await c.env.DB.prepare(
    'SELECT id, created_at FROM verification_codes WHERE email = ? AND purpose = ? AND used = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
  ).bind(normalizedEmail, 'recover', now).first<{ id: string; created_at: number }>()

  if (existingCode) {
    const elapsed = now - existingCode.created_at
    if (elapsed < RATE_LIMIT_SECONDS) {
      return c.json({ message: '验证码已发送，请查看邮箱', cooldown: RATE_LIMIT_SECONDS - elapsed })
    }
    await c.env.DB.prepare('DELETE FROM verification_codes WHERE id = ?').bind(existingCode.id).run()
  }

  const code = generateCode()
  const codeId = nanoid(21)

  await c.env.DB.prepare(
    'INSERT INTO verification_codes (id, device_id, email, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(codeId, '', normalizedEmail, code, 'recover', now + CODE_EXPIRY_SECONDS).run()

  try {
    await sendRecoveryEmail(c.env, normalizedEmail, code)
  } catch (err) {
    console.error('[login] Failed to send email:', err)
    return c.json({ error: '邮件发送失败，请稍后重试' }, 502)
  }

  return c.json({ message: '如果该邮箱已绑定，您将收到验证码' })
})

// GET /api/account/info?deviceId=xxx
app.get('/api/account/info', async (c) => {
  const deviceId = c.req.query('deviceId')
  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const device = await c.env.DB.prepare(
    'SELECT email FROM devices WHERE id = ?'
  ).bind(deviceId).first<{ email: string | null }>()

  return c.json({ email: device?.email ?? null })
})

// DELETE /api/account/unbind
app.delete('/api/account/unbind', async (c) => {
  const body = await c.req.json<{ deviceId?: string }>()
  const { deviceId } = body

  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  await c.env.DB.prepare(
    'UPDATE devices SET email = NULL WHERE id = ?'
  ).bind(deviceId).run()

  return c.json({ success: true })
})

// ============================================================
// Shares
// ============================================================

const EXPIRY_MAP: Record<string, number> = {
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  never: 365 * 24 * 60 * 60, // 1 year
}

// POST /api/shares
app.post('/api/shares', async (c) => {
  const body = await c.req.json<{ documentId?: string; deviceId?: string; expiresIn?: string }>()
  const { documentId, deviceId, expiresIn } = body

  if (!documentId || !deviceId) {
    return c.json({ error: '缺少必要参数' }, 400)
  }

  const expiry = expiresIn ?? '24h'
  const ttl = EXPIRY_MAP[expiry]
  if (!ttl) {
    return c.json({ error: '无效的过期选项' }, 400)
  }

  // Verify document belongs to device
  const doc = await c.env.DB.prepare(
    'SELECT id, name FROM documents WHERE id = ? AND device_id = ?'
  ).bind(documentId, deviceId).first<{ id: string; name: string }>()

  if (!doc) {
    return c.json({ error: '文档不存在' }, 404)
  }

  const now = Math.floor(Date.now() / 1000)
  const shareId = nanoid(21)

  await c.env.DB.prepare(
    'INSERT INTO shares (id, document_id, device_id, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(shareId, documentId, deviceId, now + ttl).run()

  return c.json({
    id: shareId,
    document_id: documentId,
    expires_at: now + ttl,
    view_count: 0,
    created_at: now,
  })
})

// GET /api/documents/:id/shares
app.get('/api/documents/:id/shares', async (c) => {
  const docId = c.req.param('id')
  const deviceId = c.req.query('deviceId')
  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const { results } = await c.env.DB.prepare(
    'SELECT id, document_id, expires_at, max_views, view_count, created_at FROM shares WHERE document_id = ? AND device_id = ? ORDER BY created_at DESC'
  ).bind(docId, deviceId).all<{
    id: string; document_id: string; expires_at: number; max_views: number | null; view_count: number; created_at: number
  }>()

  return c.json(results)
})

// DELETE /api/shares/:id
app.delete('/api/shares/:id', async (c) => {
  const shareId = c.req.param('id')
  const deviceId = c.req.query('deviceId')
  if (!deviceId) {
    return c.json({ error: 'deviceId required' }, 400)
  }

  const share = await c.env.DB.prepare(
    'SELECT id FROM shares WHERE id = ? AND device_id = ?'
  ).bind(shareId, deviceId).first()

  if (!share) {
    return c.json({ error: '分享链接不存在' }, 404)
  }

  await c.env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(shareId).run()
  return c.json({ success: true })
})

// GET /api/share/:token/info
app.get('/api/share/:token/info', async (c) => {
  const token = c.req.param('token')
  const now = Math.floor(Date.now() / 1000)

  const share = await c.env.DB.prepare(
    `SELECT s.id, s.expires_at, s.view_count, d.name, d.category
     FROM shares s JOIN documents d ON s.document_id = d.id
     WHERE s.id = ?`
  ).bind(token).first<{
    id: string; expires_at: number; view_count: number; name: string; category: string
  }>()

  if (!share) {
    return c.json({ error: '分享链接不存在或已失效' }, 404)
  }

  if (share.expires_at <= now) {
    return c.json({ error: '分享链接已过期' }, 410)
  }

  return c.json({
    name: share.name,
    category: share.category,
    expiresAt: share.expires_at,
    viewCount: share.view_count,
  })
})

// GET /api/share/:token — serve shared content
app.get('/api/share/:token', async (c) => {
  const token = c.req.param('token')
  const now = Math.floor(Date.now() / 1000)

  const share = await c.env.DB.prepare(
    `SELECT s.id, s.document_id, s.expires_at, s.view_count, d.name, d.category, d.r2_key
     FROM shares s JOIN documents d ON s.document_id = d.id
     WHERE s.id = ?`
  ).bind(token).first<{
    id: string; document_id: string; expires_at: number; view_count: number; name: string; category: string; r2_key: string
  }>()

  if (!share) {
    return c.json({ error: '分享链接不存在或已失效' }, 404)
  }

  if (share.expires_at <= now) {
    return c.json({ error: '分享链接已过期' }, 410)
  }

  // Increment view count
  await c.env.DB.prepare(
    'UPDATE shares SET view_count = view_count + 1 WHERE id = ?'
  ).bind(share.id).run()

  // Read file from R2
  const obj = await c.env.FILES_BUCKET.get(share.r2_key)
  if (!obj) {
    return c.json({ error: '文件不存在' }, 404)
  }

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(share.name)}"`,
      'Content-Length': String(obj.size),
    },
  })
})

export default app
