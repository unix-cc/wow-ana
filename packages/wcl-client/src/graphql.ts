import { config, logger, WclApiError, WclRateLimitError } from '@wcl/shared';
import type { TokenProvider } from './auth.js';
import type { RateLimitManager } from './rate-limit.js';

interface GraphQlRequestOptions {
  query: string;
  variables?: Record<string, unknown> | undefined;
  abortSignal?: AbortSignal | undefined;
}

interface GraphQlResponse<T> {
  data?: T;
  errors?: GraphQlError[];
}

interface GraphQlError {
  message: string;
  path?: Array<string | number>;
}

export interface GraphqlClientOptions {
  tokenProvider: TokenProvider;
  rateLimiter: RateLimitManager;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Minimal GraphQL client for the WCL v2 API.
 *
 * Only responsible for transport: auth header, request/response handling,
 * error normalization and rate-limit bookkeeping. It has no knowledge of
 * the report/fight/actor domain.
 */
export class GraphqlClient {
  private readonly tokenProvider: TokenProvider;
  private readonly rateLimiter: RateLimitManager;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GraphqlClientOptions) {
    this.tokenProvider = options.tokenProvider;
    this.rateLimiter = options.rateLimiter;
    this.apiUrl = options.apiUrl ?? config.wclApiUrl;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async request<T>(options: GraphQlRequestOptions): Promise<T> {
    this.rateLimiter.assertCanRequest();

    const token = await this.tokenProvider.getAccessToken();

    logger.info('WCL request', {
      queryName: options.query.match(/(query|mutation) (\w+)/)?.[1],
    });

    let response: Response;
    try {
      const init: RequestInit = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: options.query,
          variables: options.variables,
        }),
      };
      if (options.abortSignal) {
        init.signal = options.abortSignal;
      }
      response = await this.fetchImpl(this.apiUrl, init);
    } catch (error) {
      const err = error as Error;
      if (err.name === 'AbortError') {
        throw new WclApiError('WCL request aborted.');
      }
      throw new WclApiError(`WCL request failed: ${err.message}`);
    }

    this.rateLimiter.updateFromHeaders(response.headers);

    if (response.status === 429) {
      throw new WclRateLimitError('WCL rate limit exceeded.');
    }

    if (!response.ok) {
      throw new WclApiError(`WCL request returned status ${response.status}.`);
    }

    const body = (await response.json()) as GraphQlResponse<T>;

    if (body.errors && body.errors.length > 0) {
      const messages = body.errors.map((e) => e.message).join('; ');
      throw new WclApiError(`WCL GraphQL error: ${messages}`);
    }

    if (body.data === undefined) {
      throw new WclApiError('WCL response contained no data.');
    }

    return body.data;
  }
}
