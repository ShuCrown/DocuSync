export async function requestSummary(text: string): Promise<string> {
  const res = await fetch('/api/summarize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    throw new Error(`Summary request failed: ${res.status}`)
  }

  const data = await res.json() as { summary: string }
  return data.summary
}
