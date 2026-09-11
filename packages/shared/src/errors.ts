export class WclApiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WclApiError';
  }
}

export class WclAuthenticationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WclAuthenticationError';
  }
}

export class WclRateLimitError extends Error {
  readonly resetInMs: number;

  constructor(message: string, resetInMs = 0, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WclRateLimitError';
    this.resetInMs = resetInMs;
  }
}

export class WclReportNotFoundError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WclReportNotFoundError';
  }
}

export class WclFightNotFoundError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WclFightNotFoundError';
  }
}

export class AnalysisError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AnalysisError';
  }
}

/**
 * Convert an unknown thrown value into a safe, non-leaking error message
 * suitable for returning to the LLM / MCP layer.
 */
export function toSafeError(error: unknown): Error {
  if (error instanceof WclAuthenticationError) {
    return new WclAuthenticationError(
      'WCL authentication failed. Check client credentials.',
    );
  }
  if (error instanceof WclRateLimitError) {
    return new WclRateLimitError(
      'WCL rate limit reached. Please retry later.',
      error.resetInMs,
    );
  }
  if (error instanceof WclReportNotFoundError) {
    return error;
  }
  if (error instanceof WclFightNotFoundError) {
    return error;
  }
  if (error instanceof WclApiError) {
    return new WclApiError(
      'WCL API request failed. The report may not exist or the token lacks access.',
    );
  }
  return new Error('An unexpected internal error occurred.');
}
