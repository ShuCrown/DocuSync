/**
 * Ai binding stub — throws a clear error when invoked.
 *
 * The AI summarization feature is not needed for local Docker deployment.
 * If you want to add a local LLM later, replace this stub with an
 * OpenAI-compatible client (e.g. pointing at Ollama).
 */

export class AIShim {
  async run(): Promise<never> {
    throw new Error(
      'AI service is not configured. Set AI_API_URL / AI_API_KEY in .env to enable.',
    )
  }
}
