import { describe, it, expect, vi } from 'vitest';
import { buildChatUrl, streamChat, validateLlmConfig } from '../src/llm.js';

const config = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'k',
  model: 'm',
};

describe('buildChatUrl', () => {
  it('appends /chat/completions to a /v1 base', () => {
    expect(buildChatUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('handles trailing slashes', () => {
    expect(buildChatUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('accepts a full chat completions URL', () => {
    expect(
      buildChatUrl('https://api.example.com/custom/chat/completions'),
    ).toBe('https://api.example.com/custom/chat/completions');
  });

  it('accepts a bare host', () => {
    expect(buildChatUrl('https://localhost:8080')).toBe(
      'https://localhost:8080/chat/completions',
    );
  });
});

describe('validateLlmConfig', () => {
  it('returns no error when valid', () => {
    expect(validateLlmConfig(config)).toBeUndefined();
  });

  it('flags missing fields', () => {
    expect(
      validateLlmConfig({ baseUrl: '', apiKey: 'k', model: 'm' }),
    ).toContain('Base URL');
    expect(
      validateLlmConfig({ baseUrl: 'u', apiKey: '', model: 'm' }),
    ).toContain('API Key');
    expect(
      validateLlmConfig({ baseUrl: 'u', apiKey: 'k', model: '' }),
    ).toContain('模型');
  });
});

describe('streamChat', () => {
  function sseResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return { ok: true, status: 200, body } as unknown as Response;
  }

  it('yields content deltas and stops at [DONE]', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      );

    const deltas: string[] = [];
    for await (const delta of streamChat(config, [])) {
      deltas.push(delta);
    }
    expect(deltas).toEqual(['你', '好']);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer k',
        }),
      }),
    );
  });

  it('handles deltas split across SSE frames', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"cho',
          'ices":[{"delta":{"content":"hi"}}]}\n\ndata: {"choices":[{"delta":{"con',
          'tent":"!"}}]}\n\ndata: [DONE]\n\n',
        ]),
      );

    const deltas: string[] = [];
    for await (const delta of streamChat(config, [])) {
      deltas.push(delta);
    }
    expect(deltas).toEqual(['hi', '!']);
  });

  it('throws a readable error on non-ok responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'bad key',
    } as unknown as Response);

    await expect(async () => {
      for await (const _ of streamChat(config, [])) {
        // consume
      }
    }).rejects.toThrow('HTTP 401');
  });
});
