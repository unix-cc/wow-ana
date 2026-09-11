import { describe, it, expect, vi } from 'vitest';
import { AuthManager, buildTokenUrl } from '../src/auth.js';

function mockTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'token-abc',
      token_type: 'Bearer',
      expires_in: 3600,
      ...overrides,
    }),
  } as unknown as Response;
}

describe('AuthManager', () => {
  it('fetches a token and caches it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockTokenResponse());
    const auth = new AuthManager({
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://example.com/token',
    });
    (auth as unknown as { fetchImpl?: typeof fetch }).fetchImpl;
    // inject fetch via a mocked global fetch
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    const token = await auth.getAccessToken();
    expect(token).toBe('token-abc');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const token2 = await auth.getAccessToken();
    expect(token2).toBe('token-abc');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rethrows a WclAuthenticationError when credentials are missing', async () => {
    const auth = new AuthManager({
      clientId: '',
      clientSecret: '',
      tokenUrl: 'https://example.com/token',
    });
    await expect(auth.getAccessToken()).rejects.toThrow(
      'credentials are not configured',
    );
  });

  it('throws on a non-ok token response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response);
    const auth = new AuthManager({
      clientId: 'id',
      clientSecret: 'secret',
      tokenUrl: 'https://example.com/token',
    });
    await expect(auth.getAccessToken()).rejects.toThrow('rejected');
  });

  it('derives the token URL from the WCL API origin', () => {
    expect(buildTokenUrl('https://www.warcraftlogs.com/api/v2/client')).toBe(
      'https://www.warcraftlogs.com/oauth/token',
    );
    expect(buildTokenUrl('https://cn.warcraftlogs.com/api/v2/client')).toBe(
      'https://cn.warcraftlogs.com/oauth/token',
    );
  });
});
