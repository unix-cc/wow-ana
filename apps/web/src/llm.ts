/**
 * Minimal OpenAI-compatible chat-completions client used by the web backend.
 * The user brings their own endpoint / key / model; nothing is stored here.
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamOptions {
  signal?: AbortSignal | undefined;
}

/**
 * Build the chat completions URL from a user-provided base URL. Accepts a
 * bare host, a `/v1` path, or the full `/chat/completions` URL.
 */
export function buildChatUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/** Returns a human-readable problem string, or undefined when valid. */
export function validateLlmConfig(config: LlmConfig): string | undefined {
  if (!config.baseUrl.trim()) return '请先在「设置」中填写 LLM Base URL';
  if (!config.apiKey.trim()) return '请先在「设置」中填写 API Key';
  if (!config.model.trim()) return '请先在「设置」中填写模型名称';
  return undefined;
}

/**
 * Stream chat completion deltas from an OpenAI-compatible API.
 * Yields the text of each `delta.content` chunk as it arrives.
 */
export async function* streamChat(
  config: LlmConfig,
  messages: ChatMessage[],
  options?: StreamOptions,
): AsyncGenerator<string> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: config.model.trim(),
      messages,
      stream: true,
    }),
  };
  if (options?.signal) {
    init.signal = options.signal;
  }

  const response = await fetch(buildChatUrl(config.baseUrl), init);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `LLM 请求失败（HTTP ${response.status}）：${detail.slice(0, 300)}`,
    );
  }
  if (!response.body) {
    throw new Error('LLM 响应没有 body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;

      let json: unknown;
      try {
        json = JSON.parse(data);
      } catch {
        continue; // keep-alive / partial line
      }

      const choices = (
        json as { choices?: Array<{ delta?: { content?: unknown } }> }
      ).choices;
      const content = choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) {
        yield content;
      }
    }
  }
}
