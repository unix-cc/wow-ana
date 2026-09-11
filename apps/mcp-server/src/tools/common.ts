import type { AppService } from '@wcl/application';

export interface ToolContext {
  service: AppService;
}

/**
 * Format a result as a successful MCP text response.
 */
export function okText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

/**
 * Format an error as an MCP error response, using the safe message only.
 */
export function errText(error: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: (error as Error).message }),
      },
    ],
    isError: true,
  };
}
