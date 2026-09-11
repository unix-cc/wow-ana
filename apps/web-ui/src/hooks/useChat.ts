import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActivityStep,
  AnalysisArtifact,
  ChatEvent,
  ChatMessage,
  ComparisonView,
  LlmConfig,
  MessagePart,
} from '../types';
import {
  deleteSession,
  getSessionId,
  listSessions,
  loadSessionMessages,
  streamChat,
  useSession,
} from '../api';

export interface ReplyOption {
  label: string;
  value: string;
}

/** One rendered message: an ordered list of parts, not a string. */
export interface ViewMessage {
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

export interface ChatViewState {
  messages: ViewMessage[];
  /** Latest turn reply that carries selectable options (fight / player). */
  options: ReplyOption[];
  isStreaming: boolean;
  error: string | null;
}

export interface UseChatResult {
  view: ChatViewState;
  sessionId: string;
  sessions: Array<{ sessionId: string; title: string }>;
  send: (text: string, llm: LlmConfig) => void;
  pick: (value: string, llm: LlmConfig) => void;
  newChat: () => void;
  switchSession: (id: string) => void;
  removeSession: (id: string) => void;
  refresh: () => void;
}

const emptyView: ChatViewState = {
  messages: [],
  options: [],
  isStreaming: false,
  error: null,
};

/** Project one persisted message into its render parts. */
export function toParts(message: ChatMessage): MessagePart[] {
  const parts: MessagePart[] = [];
  if (message.role === 'assistant') {
    if (message.activity !== undefined && message.activity.length > 0) {
      parts.push({ type: 'activity', steps: message.activity });
    }
    if (message.artifact !== undefined) {
      parts.push({ type: 'artifact', artifact: message.artifact });
    }
    if (message.comparison !== undefined) {
      parts.push({ type: 'comparison', comparison: message.comparison });
    }
  }
  if (message.content.length > 0) {
    parts.push({
      type: 'text',
      text: message.content,
      isError: message.content.startsWith('（错误）'),
    });
  }
  return parts;
}

function optionsFromReply(reply: {
  kind: 'ask-fight' | 'ask-player';
  fights: Array<{ id: number; name: string }>;
  players: Array<{ id: number; name: string; spec?: string }>;
}): ReplyOption[] {
  if (reply.kind === 'ask-fight') {
    return reply.fights.map((f) => ({
      label: `${f.id}. ${f.name}`,
      value: String(f.id),
    }));
  }
  if (reply.kind === 'ask-player') {
    return reply.players.map((p) => ({
      label: p.spec ? `${p.name}（${p.spec}）` : p.name,
      value: p.name,
    }));
  }
  return [];
}

export function useChat(): UseChatResult {
  const [view, setView] = useState<ChatViewState>(emptyView);
  const [sessionId, setSessionId] = useState<string>(() => getSessionId());
  const [sessions, setSessions] = useState<Array<{ sessionId: string; title: string }>>(
    [],
  );

  const viewRef = useRef<ChatViewState>(view);
  viewRef.current = view;

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch {
      setSessions([]);
    }
  }, []);

  const loadCurrent = useCallback(async (id: string) => {
    setView(emptyView);
    let messages: ChatMessage[] = [];
    try {
      messages = await loadSessionMessages(id);
    } catch {
      // keep the welcome screen on failure
    }
    setView((prev) => ({
      ...prev,
      messages: messages.map((m) => ({ role: m.role, parts: toParts(m) })),
    }));
  }, []);

  /** Stream one turn, assembling the assistant message part by part. */
  const runTurn = useCallback(
    async (message: string, llm: LlmConfig): Promise<void> => {
      setView((prev) => ({
        ...prev,
        isStreaming: true,
        error: null,
        messages: [
          ...prev.messages,
          { role: 'user' as const, parts: [{ type: 'text' as const, text: message, isError: false }] },
          { role: 'assistant' as const, parts: [] },
        ],
      }));

      // Mutable accumulators for the in-flight assistant message.
      let assistantText = '';
      let activity: ActivityStep[] = [];
      let artifact: AnalysisArtifact | undefined;
      let comparison: ComparisonView | undefined;
      let pendingOptions: ReplyOption[] = [];

      /** Re-render the trailing assistant message from the accumulators. */
      const render = (): void => {
        setView((prev) => {
          const messages = [...prev.messages];
          const parts: MessagePart[] = [];
          if (activity.length > 0) parts.push({ type: 'activity', steps: [...activity] });
          if (artifact !== undefined) parts.push({ type: 'artifact', artifact });
          if (comparison !== undefined) parts.push({ type: 'comparison', comparison });
          if (assistantText.length > 0) {
            parts.push({
              type: 'text',
              text: assistantText,
              isError: assistantText.startsWith('（错误）'),
            });
          }
          messages[messages.length - 1] = { role: 'assistant', parts };
          return { ...prev, messages };
        });
      };

      const onEvent = (event: ChatEvent): void => {
        switch (event.type) {
          case 'delta':
            assistantText += event.text;
            render();
            break;
          case 'activity': {
            const index = activity.findIndex((s) => s.id === event.step.id);
            activity =
              index >= 0
                ? activity.map((s, i) => (i === index ? event.step : s))
                : [...activity, event.step];
            render();
            break;
          }
          case 'artifact':
            artifact = event.artifact;
            render();
            break;
          case 'comparison':
            comparison = event.comparison;
            render();
            break;
          case 'reply':
            if (
              event.kind === 'ask-fight' ||
              event.kind === 'ask-player'
            ) {
              pendingOptions = optionsFromReply({
                kind: event.kind,
                fights: event.fights ?? [],
                players: event.players ?? [],
              });
            }
            if (event.text !== undefined) {
              // Non-streamed deterministic replies are their own message.
              setView((prev) => {
                const messages = [...prev.messages];
                messages[messages.length - 1] = {
                  role: 'assistant',
                  parts: [{ type: 'text', text: event.text ?? '', isError: event.kind === 'error' }],
                };
                return { ...prev, messages };
              });
            }
            break;
          case 'error':
            assistantText = assistantText.length > 0 ? assistantText : `（错误）${event.text}`;
            setView((prev) => ({ ...prev, error: event.text }));
            render();
            break;
          case 'start':
          case 'done':
            break;
        }
      };

      try {
        await streamChat({ sessionId, message, llm, onEvent });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        assistantText = `（错误）${text}`;
        setView((prev) => ({ ...prev, error: text }));
        render();
      } finally {
        // Drop a still-empty assistant bubble (e.g. a reply that only carried
        // options) so the stream never shows a blank card.
        setView((prev) => {
          const messages = [...prev.messages];
          const last = messages[messages.length - 1];
          if (last !== undefined && last.parts.length === 0) messages.pop();
          return { ...prev, messages, isStreaming: false, options: pendingOptions };
        });
        await refreshSessions();
      }
    },
    [sessionId, refreshSessions],
  );

  const send = useCallback(
    (text: string, llm: LlmConfig) => {
      const trimmed = text.trim();
      if (!trimmed || viewRef.current.isStreaming) return;
      void runTurn(trimmed, llm);
    },
    [runTurn],
  );

  const pick = useCallback(
    (value: string, llm: LlmConfig) => {
      void runTurn(value, llm);
    },
    [runTurn],
  );

  const newChat = useCallback(() => {
    const id = useSessionAndGet();
    setSessionId(id);
    setView(emptyView);
    void refreshSessions();
  }, [refreshSessions]);

  const switchSession = useCallback(
    (id: string) => {
      useSession(id);
      setSessionId(id);
      void loadCurrent(id);
      void refreshSessions();
    },
    [loadCurrent, refreshSessions],
  );

  const removeSession = useCallback(
    async (id: string) => {
      try {
        await deleteSession(id);
      } catch {
        // ignore
      }
      if (id === sessionId) {
        newChat();
      } else {
        void refreshSessions();
      }
    },
    [sessionId, newChat, refreshSessions],
  );

  const refresh = useCallback(() => {
    void refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    void loadCurrent(sessionId);
    void refreshSessions();
    // Mount only: load the persisted session once on startup.
  }, []);

  return { view, sessionId, sessions, send, pick, newChat, switchSession, removeSession, refresh };
}

function useSessionAndGet(): string {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  useSession(id);
  return id;
}