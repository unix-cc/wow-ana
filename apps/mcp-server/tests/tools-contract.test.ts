import { describe, it, expect, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createServer } from '../src/server.js';
import type { AppService } from '../src/services/app-service.js';
import { MAX_RAW_EVENT_LIMIT } from '@wcl/application';

function mockService(): AppService {
  return {
    getPlayerCasts: vi.fn(),
    getPlayerBuffs: vi.fn(),
    getPlayerDamage: vi.fn(),
    getPlayerDeaths: vi.fn(),
    getCombatFacts: vi.fn(),
    getSpecKnowledge: vi.fn(),
    analyzeFight: vi.fn(),
    analyzeDeathReview: vi.fn(),
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

function textOf(result: CallToolResult): string | undefined {
  const entry = result.content.find((c): c is { type: 'text'; text: string } => {
    return c.type === 'text' && typeof c.text === 'string';
  });
  return entry?.text;
}

const baseArgs = { reportCode: 'ABC123', fightId: 8, playerId: 42 };

/**
 * Phase H contract tests: new deterministic tools are registered, raw event
 * tools enforce the hard limit, and errors degrade to the MCP error shape
 * instead of crashing.
 */
describe('insight tools', () => {
  it('get_combat_facts calls the service and returns its view', async () => {
    const service = mockService();
    (service.getCombatFacts as ReturnType<typeof vi.fn>).mockResolvedValue({
      fightId: 8,
      durationMs: 100_000,
      player: { id: 42, name: 'Hero' },
      casts: { totalCasts: 3, abilities: [], abilitiesCapped: false },
    });
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_combat_facts',
      arguments: { ...baseArgs, cooldowns: [{ abilityId: 1, cooldownMs: 90_000 }] },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"fightId":8');
    expect(service.getCombatFacts).toHaveBeenCalledWith('ABC123', {
      fightId: 8,
      playerId: 42,
      cooldowns: [{ abilityId: 1, cooldownMs: 90_000 }],
    });
    await client.close();
  });

  it('get_spec_knowledge returns the resolved knowledge', async () => {
    const service = mockService();
    (service.getSpecKnowledge as ReturnType<typeof vi.fn>).mockResolvedValue({
      specId: 62,
      specName: 'Arcane',
      knowledgeVersion: '1.2.0',
      patch: '12.1',
      abilities: [],
      buffs: [],
      debuffs: [],
      resources: [],
      cooldowns: [],
      priority: [],
      sources: [],
    });
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_spec_knowledge',
      arguments: baseArgs,
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"specName":"Arcane"');
    expect(service.getSpecKnowledge).toHaveBeenCalledWith('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    await client.close();
  });

  it('get_spec_knowledge degrades to an MCP error when no knowledge exists', async () => {
    const service = mockService();
    (service.getSpecKnowledge as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('没有可用的职业知识'),
    );
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_spec_knowledge',
      arguments: baseArgs,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('没有可用的职业知识');
    await client.close();
  });

  it('analyze_fight forwards include/cooldowns and returns the full outcome', async () => {
    const service = mockService();
    (service.analyzeFight as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: { playerId: 42, name: 'Hero', spec: 'Arcane', type: 'Player' },
      result: { findings: [], metrics: {}, score: { overall: 80 } },
      rotation: {
        scenario: 'st',
        breakdown: { correct: 9, unknown: 1 },
        decisionCount: 10,
        unknownCount: 1,
        knowledge: { specName: 'Arcane', knowledgeVersion: '1.2.0' },
        samples: [],
        samplesCapped: false,
      },
    });
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'analyze_fight',
      arguments: {
        ...baseArgs,
        analysis: ['rotation', 'damage'],
        cooldowns: [{ cooldownMs: 90_000 }],
      },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"scenario":"st"');
    expect(service.analyzeFight).toHaveBeenCalledWith('ABC123', {
      fightId: 8,
      playerId: 42,
      cooldowns: [{ cooldownMs: 90_000 }],
      include: ['rotation', 'damage'],
    });
    await client.close();
  });

  it('analyze_death_review calls the service and returns the bounded view', async () => {
    const service = mockService();
    (service.analyzeDeathReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      reportCode: 'ABC123',
      fightId: 8,
      fightName: '密谋小径',
      deaths: [
        {
          deathAt: 1_134_000,
          relativeMs: 1_134_000,
          playerId: 42,
          playerName: '西爱',
          role: 'healer',
          windowMs: 8000,
          hits: 2,
          takenTotal: 844_348,
          burstMs: 600,
          killer: {
            sourceId: 53,
            sourceName: '亵渎傀儡',
            abilityId: 1_294_827,
            abilityName: '灵魂撕裂',
            amount: 512_000,
            at: 1_134_000,
          },
          topSources: [],
          mobFirstAttacks: [],
          healingReceived: 120_000,
          healCount: 3,
          healAttempts: 4,
          overhealInWindow: 30_000,
          healers: [{ playerId: 45, playerName: '奶德', count: 3, total: 120_000 }],
          cause: 'burst-kill',
          summary: '0.6s 内两击 844,348',
        },
      ],
      wipes: [],
      adds: [],
    });
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'analyze_death_review',
      arguments: { reportCode: 'ABC123', fightId: 8, wipeGapMs: 60_000 },
    });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('"deathCount":1');
    expect(textOf(result)).toContain('"cause":"burst-kill"');
    expect(service.analyzeDeathReview).toHaveBeenCalledWith('ABC123', {
      fightId: 8,
      wipeGapMs: 60_000,
    });
    await client.close();
  });

  it('analyze_death_review omits wipeGapMs when not supplied', async () => {
    const service = mockService();
    (service.analyzeDeathReview as ReturnType<typeof vi.fn>).mockResolvedValue({
      reportCode: 'ABC123',
      fightId: 8,
      fightName: 'Fight 8',
      deaths: [],
      wipes: [],
      adds: [],
    });
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'analyze_death_review',
      arguments: { reportCode: 'ABC123', fightId: 8 },
    });
    expect(result.isError).toBeFalsy();
    expect(service.analyzeDeathReview).toHaveBeenCalledWith('ABC123', {
      fightId: 8,
    });
    await client.close();
  });

  it('analyze_death_review degrades to an MCP error on failure', async () => {
    const service = mockService();
    (service.analyzeDeathReview as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Fight 999 not found'),
    );
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'analyze_death_review',
      arguments: { reportCode: 'ABC123', fightId: 999 },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Fight 999 not found');
    await client.close();
  });
});

describe('raw event tools enforce the hard limit', () => {
  it('defaults to the cap when no limit is passed', async () => {
    const service = mockService();
    (service.getPlayerCasts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_player_casts',
      arguments: baseArgs,
    });
    expect(result.isError).toBeFalsy();
    expect(service.getPlayerCasts).toHaveBeenCalledWith('ABC123', 8, 42, {
      limit: undefined,
    });
    await client.close();
  });

  it('passes an explicit in-range limit through', async () => {
    const service = mockService();
    (service.getPlayerDamage as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_player_damage',
      arguments: { ...baseArgs, limit: 250 },
    });
    expect(result.isError).toBeFalsy();
    expect(service.getPlayerDamage).toHaveBeenCalledWith('ABC123', 8, 42, {
      limit: 250,
    });
    await client.close();
  });

  it('rejects a limit above the hard cap without calling the service', async () => {
    const service = mockService();
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_player_deaths',
      arguments: { ...baseArgs, limit: MAX_RAW_EVENT_LIMIT + 1 },
    });
    expect(result.isError).toBe(true);
    expect(service.getPlayerDeaths).not.toHaveBeenCalled();
    await client.close();
  });

  it('propagates a service failure as an MCP error text', async () => {
    const service = mockService();
    (service.getPlayerBuffs as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('WCL down'),
    );
    const { client } = await connect(service);
    const result = await client.callTool({
      name: 'get_player_buffs',
      arguments: baseArgs,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('WCL down');
    await client.close();
  });
});
