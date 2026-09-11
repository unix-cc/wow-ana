import { describe, it, expect, vi } from 'vitest';
import type { AppService } from '@wcl/application';
import type { Fight, Player, Report } from '@wcl/domain';
import {
  extractWclUrl,
  isCompareIntent,
  isDeathReviewIntent,
  matchFight,
  matchPlayer,
  processTurn,
} from '../src/pipeline.js';

const report: Report = {
  code: 'ABC123',
  title: '深渊测试',
  startTime: 0,
  endTime: 100_000,
  zone: { id: 1000, name: 'Nerub-ar Palace' },
};

const fights: Fight[] = [
  { id: 1, name: '拉夏南', startTime: 0, endTime: 10_000 },
  { id: 8, name: '高阶督军', startTime: 0, endTime: 20_000 },
];

const players: Player[] = [
  { id: 42, name: 'Hero', type: 'Player', specName: 'Beast Mastery' },
  { id: 43, name: 'Mage', type: 'Player', specName: 'Frost' },
];

function makeMockService(): AppService {
  return {
    getReport: vi.fn().mockResolvedValue(report),
    getFights: vi.fn().mockResolvedValue(fights),
    getPlayers: vi.fn().mockResolvedValue(players),
    // The pipeline uses analyzeFight (it also returns the rotation digest the
    // structured artifact renders).
    analyzeFight: vi.fn().mockResolvedValue({
      summary: {
        playerId: 42,
        name: 'Hero',
        spec: 'Beast Mastery',
        type: 'Player',
      },
      result: { findings: [], metrics: {}, score: { overall: 90 } },
    }),
  } as unknown as AppService;
}

describe('extractWclUrl', () => {
  it('extracts www and cn report URLs with queries', () => {
    expect(
      extractWclUrl(
        '帮我看下 https://www.warcraftlogs.com/reports/ABC123?fight=8 这个',
      ),
    ).toBe('https://www.warcraftlogs.com/reports/ABC123?fight=8');
    expect(
      extractWclUrl(
        'https://cn.warcraftlogs.com/reports/XYZ9?fight=2&type=damage-done',
      ),
    ).toBe('https://cn.warcraftlogs.com/reports/XYZ9?fight=2&type=damage-done');
  });

  it('stops before Chinese text', () => {
    const url = extractWclUrl(
      'https://www.warcraftlogs.com/reports/ABC123?fight=8麻烦分析',
    );
    expect(url).toBe('https://www.warcraftlogs.com/reports/ABC123?fight=8');
  });

  it('returns undefined without a URL', () => {
    expect(extractWclUrl('分析我的兽王猎')).toBeUndefined();
  });
});

describe('matchFight', () => {
  it('matches by fight number', () => {
    expect(matchFight(fights, 'fight=8')).toEqual(fights[1]);
    expect(matchFight(fights, '选 8')).toEqual(fights[1]);
  });

  it('matches by name', () => {
    expect(matchFight(fights, '分析拉夏南')).toEqual(fights[0]);
  });

  it('returns undefined when no fight matches', () => {
    expect(matchFight(fights, '完全无关')).toBeUndefined();
  });
});

describe('matchPlayer', () => {
  it('matches by exact name', () => {
    expect(matchPlayer(players, 'Hero')).toEqual(players[0]);
  });

  it('matches by substring', () => {
    expect(matchPlayer(players, '帮我分析 Mage 这名玩家')).toEqual(players[1]);
  });

  it('returns undefined when no player matches', () => {
    expect(matchPlayer(players, 'Priest')).toBeUndefined();
  });
});

describe('processTurn', () => {
  it('guides the user when no WCL URL is present', async () => {
    const outcome = await processTurn({
      session: undefined,
      message: '你好',
      service: makeMockService(),
    });
    expect(outcome.reply.kind).toBe('guidance');
    expect(outcome.session).toBeUndefined();
  });

  it('asks which player when the URL has a fight id', async () => {
    const service = makeMockService();
    const outcome = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });

    expect(outcome.reply.kind).toBe('ask-player');
    expect(outcome.session?.stage).toBe('ask-player');
    expect(service.getPlayers).toHaveBeenCalledWith('ABC123', 8);
    if (outcome.reply.kind === 'ask-player') {
      expect(outcome.reply.players).toHaveLength(2);
      expect(outcome.reply.players[0]?.name).toBe('Hero');
    }
  });

  it('asks which fight when the URL has no fight id', async () => {
    const service = makeMockService();
    const outcome = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123',
      service,
    });

    expect(outcome.reply.kind).toBe('ask-fight');
    expect(outcome.session?.stage).toBe('ask-fight');
    if (outcome.reply.kind === 'ask-fight') {
      expect(outcome.reply.fights).toHaveLength(2);
    }
  });

  it('resolves fight selection into an ask-player session', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123',
      service,
    });

    const second = await processTurn({
      session: first.session,
      message: 'fight=8',
      service,
    });

    expect(second.reply.kind).toBe('ask-player');
    expect(second.session?.stage).toBe('ask-player');
    expect(service.getPlayers).toHaveBeenCalledWith('ABC123', 8);
  });

  it('produces an analysis when the player is chosen', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });

    const second = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });

    expect(second.reply.kind).toBe('analysis');
    expect(second.session?.stage).toBe('ready');
    expect(service.analyzeFight).toHaveBeenCalledWith('ABC123', {
      fightId: 8,
      playerId: 42,
    });
    if (second.reply.kind === 'analysis') {
      expect(second.reply.analysis.summary?.name).toBe('Hero');
    }
  });

  it('keeps the fight context for a second player analysis', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });
    const selected = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });

    const second = await processTurn({
      session: selected.session,
      message: 'Mage',
      service,
    });

    expect(second.reply.kind).toBe('analysis');
    expect(second.session?.stage).toBe('ready');
    expect(service.analyzeFight).toHaveBeenLastCalledWith('ABC123', {
      fightId: 8,
      playerId: 43,
    });
  });

  it('hands general follow-up questions to the LLM layer', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });
    const selected = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });

    const followUp = await processTurn({
      session: selected.session,
      message: '刚才最需要优先改什么？',
      service,
    });

    expect(followUp.reply).toEqual({ kind: 'followup' });
    expect(followUp.session?.stage).toBe('ready');
  });

  it('re-asks when the player name does not match', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });

    const second = await processTurn({
      session: first.session,
      message: 'Warrior',
      service,
    });

    expect(second.reply.kind).toBe('ask-player');
    expect(second.session?.stage).toBe('ask-player');
    expect(service.analyzeFight).not.toHaveBeenCalled();
  });

  it('reports a useful error for unknown fight ids', async () => {
    const service = makeMockService();
    const outcome = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=999',
      service,
    });
    expect(outcome.reply.kind).toBe('error');
  });

  it('restarts the flow when a new report URL arrives mid fight-selection', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123',
      service,
    });
    expect(first.session?.stage).toBe('ask-fight');

    const second = await processTurn({
      session: first.session,
      message: '换这个 https://www.warcraftlogs.com/reports/ABC123?fight=1',
      service,
    });

    // The URL wins over fight-name matching; the session moves to ask-player.
    expect(second.reply.kind).toBe('ask-player');
    expect(second.session?.stage).toBe('ask-player');
    expect(service.getPlayers).toHaveBeenCalledWith('ABC123', 1);
  });

  it('routes death-review intent from the ask-player stage', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });

    const second = await processTurn({
      session: first.session,
      message: '为什么灭了',
      service,
    });

    // Whole-fight review needs no player pick, so the intent is not swallowed
    // by the "player name did not match" re-ask branch.
    expect(second.reply).toEqual({ kind: 'death-review' });
    expect(second.session?.stage).toBe('ask-player');
    expect(service.analyzeFight).not.toHaveBeenCalled();
  });

  it('still allows player selection after a death-review intent', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });

    const second = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });

    expect(second.reply.kind).toBe('analysis');
    expect(second.session?.stage).toBe('ready');
  });

  it('reports every deterministic stage as activity', async () => {
    const service = makeMockService();
    const seen: Array<{ id: string; label: string; status: string; detail?: string }> = [];

    await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
      onActivity: (step) => seen.push(step),
    });

    // Report → fights → players, each running then done.
    expect(seen.map((s) => `${s.id}:${s.status}`)).toEqual([
      'report:running',
      'report:done',
      'fights:running',
      'fights:done',
      'players:running',
      'players:done',
    ]);
    // The detail line is the *result*, not a fake progress percent.
    expect(seen[1]?.detail).toBe('深渊测试');
    expect(seen[3]?.detail).toBe('2 场战斗');
    expect(seen[5]?.detail).toBe('2 人');
  });

  it('reports a failed step and rethrows when a stage blows up', async () => {
    const service = makeMockService();
    (service.getReport as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );
    const seen: Array<{ id: string; status: string; detail?: string }> = [];

    await expect(
      processTurn({
        session: undefined,
        message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
        service,
        onActivity: (step) => seen.push(step),
      }),
    ).rejects.toThrow('boom');

    expect(seen[0]).toMatchObject({ id: 'report', status: 'running' });
    // The step detail carries the wrapped, user-facing message.
    expect(seen[1]).toMatchObject({ id: 'report', status: 'failed' });
    expect(seen[1]?.detail).toContain('boom');
  });

  it('carries the rotation digest through to the analysis payload', async () => {
    const service = makeMockService();
    const rotation = {
      scenario: 'st' as const,
      breakdown: { correct: 9 },
      decisionCount: 9,
      unknownCount: 0,
      knowledge: { specName: 'Beast Mastery', knowledgeVersion: '1.0.0' },
      samples: [],
      samplesCapped: false,
    };
    (service.analyzeFight as ReturnType<typeof vi.fn>).mockResolvedValue({
      summary: { playerId: 42, name: 'Hero', spec: 'Beast Mastery', type: 'Player' },
      result: { findings: [], metrics: {}, score: { overall: 90 } },
      rotation,
    });

    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });
    const second = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });

    expect(second.reply.kind).toBe('analysis');
    if (second.reply.kind === 'analysis') {
      expect(second.reply.analysis.rotation).toEqual(rotation);
    }
  });

  it('omits the rotation digest when the spec has no knowledge', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });
    const second = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });

    expect(second.reply.kind).toBe('analysis');
    if (second.reply.kind === 'analysis') {
      expect('rotation' in second.reply.analysis).toBe(false);
    }
  });

  it('recognises the head-to-head comparison intent', () => {
    for (const message of [
      '和榜首逐场对比一下，我到底差在哪',
      '横向对比一下',
      '对比榜首',
      '我到底差在哪',
      '对标一下第一名',
    ]) {
      expect(isCompareIntent(message)).toBe(true);
    }
    // A plain follow-up must not be hijacked by the comparison path.
    for (const message of ['这个副本怎么打', '狂野怒火是什么技能']) {
      expect(isCompareIntent(message)).toBe(false);
    }
  });

  it('keeps the death-review and compare intents independent', () => {
    expect(isDeathReviewIntent('谁引的怪')).toBe(true);
    expect(isCompareIntent('谁引的怪')).toBe(false);
    expect(isCompareIntent('和榜首对比')).toBe(true);
    expect(isDeathReviewIntent('和榜首对比')).toBe(false);
  });

  it('answers with the compare reply (not a follow-up) once a run is analysed', async () => {
    const service = makeMockService();
    const first = await processTurn({
      session: undefined,
      message: 'https://www.warcraftlogs.com/reports/ABC123?fight=8',
      service,
    });
    const analysed = await processTurn({
      session: first.session,
      message: 'Hero',
      service,
    });
    expect(analysed.reply.kind).toBe('analysis');

    const compared = await processTurn({
      session: analysed.session,
      message: '和榜首逐场对比一下，我到底差在哪',
      service,
    });
    expect(compared.reply.kind).toBe('compare');
    // The pipeline itself does no fetching — that happens downstream.
    expect(service.getPlayers).toHaveBeenCalledTimes(1);
  });
});
