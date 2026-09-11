import {
  WclClient,
  GraphqlClient,
  AuthManager,
  RateLimitManager,
  type GraphqlClientOptions,
} from '@wcl/wcl-client';
import type { WclClientCache } from '@wcl/wcl-client';

/**
 * Assemble the WCL data layer: OAuth + GraphQL transport + rate limiter,
 * optionally backed by a cache. Exposes a single WclClient for the app.
 */
export function buildWclClient(options?: {
  cache?: WclClientCache | undefined;
  apiUrl?: string | undefined;
}): WclClient {
  const graphqlOptions: GraphqlClientOptions = {
    tokenProvider: new AuthManager(),
    rateLimiter: new RateLimitManager(),
  };
  if (options?.apiUrl) {
    graphqlOptions.apiUrl = options.apiUrl;
  }

  return new WclClient({
    graphql: new GraphqlClient(graphqlOptions),
    cache: options?.cache,
  });
}
