import type { ChatEvent, ChatMessage, LlmConfig, SessionSummary } from './types';

const SESSION_KEY = 'wcl-session-id';
const CONFIG_KEY = 'wcl-llm-config';

/** localStorage may be absent in SSR / non-browser contexts; degrade safely. */
function storage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : undefined;
  } catch {
    return undefined;
  }
}

/** Stable session id persisted across reloads. */
export function createSessionId(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage()?.setItem(SESSION_KEY, id);
  return id;
}

export function getSessionId(): string {
  return storage()?.getItem(SESSION_KEY) || createSessionId();
}

export function useSession(id: string): void {
  storage()?.setItem(SESSION_KEY, id);
}

// ---------------------------------------------------------------- settings
export function loadSettings(): LlmConfig {
  try {
    const parsed = JSON.parse(
      storage()?.getItem(CONFIG_KEY) || '{}',
    ) as Partial<LlmConfig>;
    // Merge over defaults so the LlmConfig contract (three required strings)
    // holds even for absent localStorage or legacy stored shapes.
    return {
      baseUrl: parsed.baseUrl ?? '',
      apiKey: parsed.apiKey ?? '',
      model: parsed.model ?? '',
    };
  } catch {
    return { baseUrl: '', apiKey: '', model: '' };
  }
}

export function saveSettings(config: LlmConfig): void {
  storage()?.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function isLlmReady(config: LlmConfig): boolean {
  return Boolean(config.baseUrl && config.apiKey && config.model);
}

// --------------------------------------------------------------- session API
async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const data = await readJson<{ sessions?: SessionSummary[] }>(
    await fetch('/api/sessions'),
  );
  return data.sessions ?? [];
}

export async function loadSessionMessages(
  sessionId: string,
): Promise<ChatMessage[]> {
  const data = await readJson<{ messages?: ChatMessage[] }>(
    await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`),
  );
  return data.messages ?? [];
}

export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}

// --------------------------------------------------------------- SSE chat
/**
 * POST /api/chat and consume the SSE stream, invoking `onEvent` for every
 * parsed `data:` frame. Resolves when the stream ends (or rejects on a
 * non-OK HTTP status so the caller can surface the backend error).
 */
export async function streamChat(options: {
  sessionId: string;
  message: string;
  llm: LlmConfig;
  onEvent: (event: ChatEvent) => void;
}): Promise<void> {
  const { sessionId, message, llm, onEvent } = options;

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, llm }),
  });

  if (!res.ok) {
    let detail = `请求失败（HTTP ${res.status}）`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = body.error;
    } catch {
      /* keep default */
    }
    onEvent({ type: 'error', text: detail });
    return;
  }
  if (!res.body) {
    onEvent({ type: 'error', text: '响应没有内容' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      let event: ChatEvent;
      try {
        event = JSON.parse(line.slice(5).trim()) as ChatEvent;
      } catch {
        continue;
      }
      onEvent(event);
    }
  }
}