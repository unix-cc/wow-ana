import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppService } from '@wcl/application';
import { registerReportTools } from './report.js';
import { registerFightTools } from './fight.js';
import { registerPlayerTools } from './player.js';
import { registerAnalysisTools } from './analysis.js';
import { registerInsightTools } from './insight.js';

/**
 * Register every MCP tool, each delegating to the AppService. This module is
 * the only place that maps service use-cases to tool names.
 */
export function registerAllTools(server: McpServer, service: AppService): void {
  registerReportTools(server, service);
  registerFightTools(server, service);
  registerPlayerTools(server, service);
  registerAnalysisTools(server, service);
  registerInsightTools(server, service);
}
