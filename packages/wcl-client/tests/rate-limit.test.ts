import { describe, it, expect } from 'vitest';
import { RateLimitManager } from '../src/rate-limit.js';
import { WclRateLimitError } from '@wcl/shared';

describe('RateLimitManager', () => {
  it('starts with a default budget and allows requests', () => {
    const limiter = new RateLimitManager();
    expect(() => limiter.assertCanRequest()).not.toThrow();
  });

  it('updates state from headers', () => {
    const limiter = new RateLimitManager();
    limiter.updateFromHeaders(
      new Headers({
        'x-ratelimit-limit': '100',
        'x-ratelimit-points-spent': '40',
        'x-ratelimit-points-reset-in': '60',
      }),
    );
    const state = limiter.getState();
    expect(state.limit).toBe(100);
    expect(state.pointsSpent).toBe(40);
    expect(state.pointsResetIn).toBe(60);
  });

  it('throws when remaining budget is below threshold', () => {
    const limiter = new RateLimitManager();
    limiter.updateFromHeaders(
      new Headers({
        'x-ratelimit-limit': '100',
        'x-ratelimit-points-spent': '95',
        'x-ratelimit-points-reset-in': '30',
      }),
    );
    expect(() => limiter.assertCanRequest()).toThrow(WclRateLimitError);
  });

  it('ignores malformed header values', () => {
    const limiter = new RateLimitManager();
    limiter.updateFromHeaders(
      new Headers({
        'x-ratelimit-limit': 'abc',
        'x-ratelimit-points-spent': '-1',
      }),
    );
    const state = limiter.getState();
    expect(state.limit).toBe(100);
    expect(state.pointsSpent).toBe(0);
  });
});
