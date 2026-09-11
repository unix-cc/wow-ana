import type { CacheStore } from '@wcl/storage';
import type { ChatMessage } from './llm.js';
import type { SessionState } from './pipeline.js';
import type { ActivityStep, AnalysisArtifact } from './artifact.js';
import type { ComparisonView } from './compare.js';

/**
 * One persisted conversation entry. `content` is what the LLM produced (and
 * what it gets back as context); `artifact` / `activity` / `comparison` are the
 * **structured** parts of the same message, kept so a reloaded session
 * re-renders its cards instead of degrading to bare Markdown. They are stripped
 * before the text is fed back to the model — the model never sees (or needs)
 * its own render data.
 */
export interface StoredMessage extends ChatMessage {
  artifact?: AnalysisArtifact | undefined;
  activity?: ActivityStep[] | undefined;
  comparison?: ComparisonView | undefined;
}

/**
 * A persisted chat session: the deterministic selection state plus the
 * conversation history that is fed back to the LLM for context.
 */
export interface ChatSession {
  pipeline: SessionState | undefined;
  history: StoredMessage[];
  title: string;
  updatedAt: number;
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

/** Keep at most this many messages in the LLM context window. */
export const MAX_HISTORY = 30;

const KEY_PREFIX = 'chat:session:';

/**
 * Session store keyed by an opaque client-generated session id. Keeps a
 * fast in-memory copy and, when a KV store is available, mirrors sessions to
 * SQLite so they survive server restarts.
 */
export class SessionStore {
  private readonly mem = new Map<string, ChatSession>();

  constructor(private readonly kv?: CacheStore | undefined) {}

  async get(sessionId: string): Promise<ChatSession | undefined> {
    const cached = this.mem.get(sessionId);
    if (cached !== undefined) return cached;

    if (this.kv) {
      const raw = await this.kv.get(`${KEY_PREFIX}${sessionId}`);
      if (raw !== undefined) {
        try {
          const parsed = JSON.parse(raw) as ChatSession;
          this.mem.set(sessionId, parsed);
          return parsed;
        } catch {
          // corrupted entry: ignore and start fresh
        }
      }
    }
    return undefined;
  }

  async set(sessionId: string, session: ChatSession): Promise<void> {
    session.history = SessionStore.trimHistory(session.history);
    session.updatedAt = Date.now();
    this.mem.set(sessionId, session);
    if (this.kv) {
      await this.kv.set(`${KEY_PREFIX}${sessionId}`, JSON.stringify(session));
    }
  }

  async remove(sessionId: string): Promise<void> {
    this.mem.delete(sessionId);
    if (this.kv) {
      await this.kv.delete(`${KEY_PREFIX}${sessionId}`);
    }
  }

  /** List all sessions, newest first. */
  async list(): Promise<SessionSummary[]> {
    const summaries = new Map<string, SessionSummary>();

    for (const [id, session] of this.mem) {
      summaries.set(id, summarize(id, session));
    }

    if (this.kv) {
      const keys = await this.kv.listKeys(KEY_PREFIX);
      for (const key of keys) {
        const id = key.slice(KEY_PREFIX.length);
        if (summaries.has(id)) continue;
        const raw = await this.kv.get(key);
        if (raw === undefined) continue;
        try {
          const session = JSON.parse(raw) as ChatSession;
          summaries.set(id, summarize(id, session));
        } catch {
          // ignore corrupted entry
        }
      }
    }

    return [...summaries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Trim history to the most recent MAX_HISTORY messages. */
  static trimHistory(history: StoredMessage[]): StoredMessage[] {
    if (history.length <= MAX_HISTORY) return history;
    return history.slice(history.length - MAX_HISTORY);
  }
}

/**
 * Reduce stored entries to what the LLM may see: role + text only. Artifacts
 * and activity are UI render data and are deliberately not sent to the model.
 */
export function toLlmMessages(history: StoredMessage[]): ChatMessage[] {
  return history.map(({ role, content }) => ({ role, content }));
}

function summarize(sessionId: string, session: ChatSession): SessionSummary {
  return {
    sessionId,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.history.length,
  };
}
