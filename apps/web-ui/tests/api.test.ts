import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadSettings, isLlmReady, streamChat } from '../src/api';
import type { ChatEvent, LlmConfig } from '../src/types';

const LLM: LlmConfig = { baseUrl: 'http://x', apiKey: 'k', model: 'm' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('settings', () => {
  it('degrades to an empty config when localStorage is absent (Node)', () => {
    // storage() returns undefined outside the browser — the renderer must
    // never crash, just report "not configured".
    expect(loadSettings()).toEqual({ baseUrl: '', apiKey: '', model: '' });
  });

  it('treats the config as ready only when all three fields are set', () => {
    expect(isLlmReady(LLM)).toBe(true);
    expect(isLlmReady({ baseUrl: '', apiKey: 'k', model: 'm' })).toBe(false);
    expect(isLlmReady({ baseUrl: 'http://x', apiKey: '', model: 'm' })).toBe(
      false,
    );
    expect(isLlmReady({ baseUrl: 'http://x', apiKey: 'k', model: '' })).toBe(
      false,
    );
  });
});

/** Build a ReadableStream-like reader from string chunks. */
function readerFrom(chunks: string[]): {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
} {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    read: async () => {
      const chunk = chunks[i];
      i += 1;
      if (chunk === undefined) return { done: true };
      return { done: false, value: encoder.encode(chunk) };
    },
  };
}

describe('streamChat SSE parsing', () => {
  it('parses events and reassembles frames split across chunk boundaries', async () => {
    // The second SSE frame is deliberately split mid-JSON across two reads;
    // the parser must buffer until the '\n\n' terminator arrives. A garbage
    // frame in between must be skipped without failing the stream.
    const chunks = [
      'data: {"type":"start"}\n\n',
      'data: {"type":"delta","te',
      'xt":"你"}\n\ndata: not-json\n\n',
      'data: {"type":"delta","text":"好"}\n\n',
      'data: {"type":"done"}\n\n',
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, body: { getReader: () => readerFrom(chunks) } })),
    );

    const events: ChatEvent[] = [];
    await streamChat({
      sessionId: 's1',
      message: 'hi',
      llm: LLM,
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([
      { type: 'start' },
      { type: 'delta', text: '你' },
      { type: 'delta', text: '好' },
      { type: 'done' },
    ]);
  });

  it('surfaces the backend JSON error on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: '参数不正确' }),
      })),
    );

    const events: ChatEvent[] = [];
    await streamChat({
      sessionId: 's1',
      message: 'hi',
      llm: LLM,
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([{ type: 'error', text: '参数不正确' }]);
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      })),
    );

    const events: ChatEvent[] = [];
    await streamChat({
      sessionId: 's1',
      message: 'hi',
      llm: LLM,
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([{ type: 'error', text: '请求失败（HTTP 500）' }]);
  });

  it('reports an error when the response has no body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, body: null })));

    const events: ChatEvent[] = [];
    await streamChat({
      sessionId: 's1',
      message: 'hi',
      llm: LLM,
      onEvent: (event) => events.push(event),
    });

    expect(events).toEqual([{ type: 'error', text: '响应没有内容' }]);
  });
});
