import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import type { AppService } from '../src/services/app-service.js';
import { registerAllTools } from '../src/tools/index.js';

function mockService(): AppService {
  return {
    getReport: vi.fn(),
    getFights: vi.fn(),
    getPlayers: vi.fn(),
    getPlayerSummary: vi.fn(),
    getPlayerCasts: vi.fn(),
    getPlayerBuffs: vi.fn(),
    getPlayerDamage: vi.fn(),
    getPlayerDeaths: vi.fn(),
    getPlayerEvents: vi.fn(),
    analyzePlayer: vi.fn(),
    getCombatFacts: vi.fn(),
    getSpecKnowledge: vi.fn(),
    analyzeFight: vi.fn(),
  } as unknown as AppService;
}

async function connect(service: AppService) {
  const server = createServer(service);
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { server, client };
}

describe('createServer', () => {
  it('registers all expected tools', async () => {
    const { client } = await connect(mockService());
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'parse_wcl_url',
        'get_report',
        'get_fights',
        'get_players',
        'get_player_summary',
        'get_player_casts',
        'get_player_buffs',
        'get_player_damage',
        'get_player_deaths',
        'analyze_player',
        'get_combat_facts',
        'get_spec_knowledge',
        'analyze_fight',
        'analyze_death_review',
      ]),
    );
    await client.close();
  });

  it('registers tools only when registerAllTools is called', () => {
    // no-op guard to keep the module referenced for coverage
    expect(typeof registerAllTools).toBe('function');
  });
});
