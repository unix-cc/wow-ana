import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '@wcl/shared';
import { errText, okText } from './common.js';
import type { AppService } from '@wcl/application';

/**
 * Register fight-related tools.
 */
export function registerFightTools(
  server: McpServer,
  service: AppService,
): void {
  server.tool(
    'get_fights',
    'List all fights in a WCL report.',
    {
      reportCode: z.string().describe('The WCL report code, e.g. ABC123'),
    },
    async ({ reportCode }) => {
      try {
        const fights = await service.getFights(reportCode);
        return okText(fights);
      } catch (error) {
        logger.error('get_fights failed', error);
        return errText(error);
      }
    },
  );
}
