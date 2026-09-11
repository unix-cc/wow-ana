import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '@wcl/shared';
import {
  AppService,
  DatabaseService,
  buildWclClient,
} from '@wcl/application';
import { registerAllTools } from './tools/index.js';

export interface ServerContext {
  service: AppService;
  database?: DatabaseService | undefined;
}

/**
 * Compose the application: SQLite-backed cache, WCL client, and the
 * application service that coordinates them.
 */
export function buildContext(): ServerContext {
  const database = new DatabaseService();
  const client = buildWclClient({ cache: database.cache });
  const service = new AppService(client, database.cache);
  return { service, database };
}

/**
 * Create an MCP server with all tools registered. The AppService may be
 * injected for tests; otherwise a default composition is used.
 */
export function createServer(service?: AppService): McpServer {
  const appService = service ?? buildContext().service;
  const server = new McpServer({
    name: 'wcl-analyzer',
    version: '0.1.0',
  });

  registerAllTools(server, appService);
  return server;
}

export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('WCL MCP server started');
}
