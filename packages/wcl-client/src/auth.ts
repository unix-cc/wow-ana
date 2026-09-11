import { config, logger, WclAuthenticationError } from '@wcl/shared';

export interface AccessToken {
  value: string;
  /** Epoch ms at which the token expires. */
  expiresAt: number;
  /** Token type, e.g. "Bearer". */
  tokenType: string;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface TokenCache {
  getToken(): Promise<AccessToken | undefined>;
  setToken(token: AccessToken): void;
}

class InMemoryTokenCache implements TokenCache {
  private token: AccessToken | undefined;

  getToken(): Promise<AccessToken | undefined> {
    return Promise.resolve(this.token);
  }

  setToken(token: AccessToken): void {
    this.token = token;
  }
}

export interface TokenProvider {
  /**
   * Return a currently valid access token, fetching or refreshing as needed.
   */
  getAccessToken(): Promise<string>;
}

/**
 * Handles WCL OAuth2 client-credentials token acquisition and caching.
 *
 * The token is never exposed beyond this module's provider boundary.
 */
export class AuthManager implements TokenProvider {
  private readonly cache: TokenCache;
  private readonly clientId?: string | undefined;
  private readonly clientSecret?: string | undefined;
  private readonly tokenUrl: string;

  constructor(options?: {
    cache?: TokenCache | undefined;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    tokenUrl?: string | undefined;
  }) {
    this.cache = options?.cache ?? new InMemoryTokenCache();
    this.clientId = options?.clientId ?? config.wclClientId;
    this.clientSecret = options?.clientSecret ?? config.wclClientSecret;
    this.tokenUrl = options?.tokenUrl ?? buildTokenUrl(config.wclApiUrl);
  }

  async getAccessToken(): Promise<string> {
    const cached = await this.cache.getToken();
    if (cached && cached.expiresAt > Date.now() + 30_000) {
      return cached.value;
    }

    const token = await this.fetchToken();
    this.cache.setToken(token);
    return token.value;
  }

  private async fetchToken(): Promise<AccessToken> {
    if (!this.clientId || !this.clientSecret) {
      throw new WclAuthenticationError(
        'WCL client credentials are not configured.',
      );
    }

    logger.info('WCL auth: fetching access token');

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    let response: Response;
    try {
      response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
    } catch (error) {
      throw new WclAuthenticationError(
        `WCL token request failed: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      throw new WclAuthenticationError(
        `WCL token request rejected with status ${response.status}.`,
      );
    }

    const data = (await response.json()) as OAuthTokenResponse;

    if (!data.access_token || typeof data.expires_in !== 'number') {
      throw new WclAuthenticationError('WCL token response was malformed.');
    }

    logger.info('WCL auth: token acquired');

    return {
      value: data.access_token,
      tokenType: data.token_type || 'Bearer',
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }
}

export function buildTokenUrl(apiUrl: string): string {
  // WCL serves OAuth tokens at <origin>/oauth/token, not under the GraphQL
  // endpoint path. Derive the origin so both www and cn hosts work.
  return `${new URL(apiUrl).origin}/oauth/token`;
}
