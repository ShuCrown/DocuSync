import { Hono } from 'hono'
import { cors } from 'hono/cors'

interface Bindings {
  FILES_BUCKET: R2Bucket
  AI: Ai
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS middleware
app.use('*', cors())

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'docusync-api' })
})

// File upload to R2
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }

    // Generate a unique key
    const ext = file.name.split('.').pop() ?? 'bin'
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // Upload to R2
    await c.env.FILES_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        originalName: file.name,
      },
    })

    return c.json({ key, name: file.name })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      500
    )
  }
})

// AI summarization
const SYSTEM_PROMPT = `你是一个专业的文档分析助手。请对以下文档内容进行要点总结，要求：
1. 提炼核心主题和关键信息
2. 使用清晰的层次结构（标题 + 要点列表）
3. 保持简洁，突出重点
4. 使用中文回复`

app.post('/api/summarize', async (c) => {
  try {
    const body = await c.req.json<{ text?: string }>()
    const text = body.text

    if (!text || !text.trim()) {
      return c.json({ error: 'No text content provided' }, 400)
    }

    // Truncate to avoid exceeding model limits
    const maxChars = 12000
    const truncated = text.length > maxChars
      ? text.slice(0, maxChars) + '\n\n[内容已截断...]'
      : text

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: `请总结以下文档内容：\n\n${truncated}` },
    ]

    const response = await c.env.AI.run(
      '@cf/meta/llama-3.2-3b-instruct',
      { messages, max_tokens: 1024 }
    )

    return c.json({
      summary: response instanceof Object && 'response' in response
        ? (response as { response: string }).response
        : String(response),
    })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : String(err) },
      500
    )
  }
})

export default app
