interface Env {
  AI: Ai
}

const SYSTEM_PROMPT = `你是一个专业的文档分析助手。请对以下文档内容进行要点总结，要求：
1. 提炼核心主题和关键信息
2. 使用清晰的层次结构（标题 + 要点列表）
3. 保持简洁，突出重点
4. 使用中文回复`

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { text?: string }
    const text = body.text

    if (!text || !text.trim()) {
      return Response.json(
        { error: 'No text content provided' },
        { status: 400 }
      )
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

    const response = await context.env.AI.run(
      '@cf/meta/llama-3-8b-instruct',
      { messages, max_tokens: 1024 }
    )

    return Response.json({
      summary: response instanceof Object && 'response' in response
        ? (response as { response: string }).response
        : String(response),
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Summary generation failed' },
      { status: 500 }
    )
  }
}
