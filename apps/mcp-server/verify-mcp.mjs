import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
});

const client = new Client({ name: 'verify', version: '1.0.0' });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log('CONNECTED. Tools:', tools.tools.map((t) => t.name).join(', '));
  const res = await client.callTool({
    name: 'parse_wcl_url',
    arguments: { url: 'https://cn.warcraftlogs.com/reports/ABC123?fight=8' },
  });
  console.log('parse_wcl_url result:', JSON.stringify(res));
} finally {
  await client.close();
}
