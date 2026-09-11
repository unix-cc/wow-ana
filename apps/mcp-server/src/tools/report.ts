import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '@wcl/shared';
import { parseWclUrl } from '@wcl/wcl-client';
import { errText, okText } from './common.js';
import type { AppService } from '@wcl/application';

/**
 * Register URL parsing and report metadata tools.
 */
export function registerReportTools(
  server: McpServer,
  service: AppService,
): void {
  server.tool(
    'parse_wcl_url',
    'Parse a Warcraft Logs report URL into its report code, fight id, ' +
      'and optional data type. Preferred first step when the user provides ' +
      'a WCL link.',
    {
      url: z
        .string()
        .describe(
          'A WCL report URL, e.g. https://cn.warcraftlogs.com/reports/ABC123?fight=8',
        ),
    },
    ({ url }) => {
      try {
        return okText(parseWclUrl(url));
      } catch (error) {
        return errText(error);
      }
    },
  );

  server.tool(
    'get_report',
    'Fetch WCL report metadata: owner, title, start/end time and zone.',
    {
      reportCode: z.string().describe('The WCL report code, e.g. ABC123'),
    },
    async ({ reportCode }) => {
      try {
        const report = await service.getReport(reportCode);
        return okText(report);
      } catch (error) {
        logger.error('get_report failed', error);
        return errText(error);
      }
    },
  );
}
