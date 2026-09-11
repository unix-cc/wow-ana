import { logger, WclRateLimitError } from '@wcl/shared';

export interface RateLimitState {
  limit: number;
  pointsSpent: number;
  pointsResetIn: number;
}

/**
 * Tracks WCL API rate-limit budget and enforces backoff when close to the
 * limit. Reading the limit headers is best-effort; when absent, we default
 * to a conservative budget so a misconfigured response never silently burns
 * the whole allowance.
 */
export class RateLimitManager {
  private state: RateLimitState = {
    limit: 100,
    pointsSpent: 0,
    pointsResetIn: 0,
  };

  /**
   * Record the rate-limit headers returned by a response, if present.
   * Header names follow WCL's documented rate-limit convention.
   */
  updateFromHeaders(headers: Headers): void {
    const limitRaw = headers.get('x-ratelimit-limit');
    const pointsRaw = headers.get('x-ratelimit-points-spent');
    const resetRaw = headers.get('x-ratelimit-points-reset-in');

    if (limitRaw !== null) {
      const parsed = Number.parseInt(limitRaw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.state.limit = parsed;
      }
    }
    if (pointsRaw !== null) {
      const parsed = Number.parseInt(pointsRaw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        this.state.pointsSpent = parsed;
      }
    }
    if (resetRaw !== null) {
      const parsed = Number.parseInt(resetRaw, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        this.state.pointsResetIn = parsed;
      }
    }
  }

  /**
   * Assert that a request may proceed. Throws if we are at or near the limit.
   */
  assertCanRequest(threshold = 0.9): void {
    const remaining = this.state.limit - this.state.pointsSpent;
    const allowedRemaining = this.state.limit * (1 - threshold);

    if (this.state.pointsResetIn > 0 && remaining <= allowedRemaining) {
      logger.warn('WCL rate limit approaching', this.state);
      throw new WclRateLimitError(
        'WCL rate limit nearly exhausted. Pausing requests.',
        this.state.pointsResetIn * 1000,
      );
    }
  }

  getState(): RateLimitState {
    return { ...this.state };
  }
}
