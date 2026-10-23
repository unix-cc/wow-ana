import { describe, it, expect } from 'vitest';
import { makeContext, cast, damage } from './helpers.js';
import {
  collectMeteorVolleys,
  isOverkillClamped,
  summarizeVolleys,
} from '../src/specs/demon-hunter/vengeance/meteors.js';
import { darkMatterMissingRule } from '../src/specs/demon-hunter/vengeance/rules/dark-matter-missing.js';
import { VengeanceDemonHunterAnalyzer } from '../src/specs/demon-hunter/vengeance/analyzer.js';

const METEOR = 1256306;
const WORLD_KILLER = 1256617;
const SHOWER = 1264130;
const BOMB = 247454;
const META = 187827;
const IDS = { meteor: METEOR, worldKiller: WORLD_KILLER };

describe('collectMeteorVolleys', () => {
  it('groups a 3-impact chain into one single-target volley', () => {
    const events = [
      damage(1_000, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_350, METEOR, 'Voidfall Meteor', 40_500),
      damage(1_700, WORLD_KILLER, 'World Killer', 60_000),
    ];
    const volleys = collectMeteorVolleys(events, 1, IDS);
    expect(volleys).toHaveLength(1);
    expect(volleys[0]?.impacts).toBe(3);
    expect(volleys[0]?.worldKillerHits).toBe(1);
    expect(volleys[0]?.targets).toBe(1);
    expect(volleys[0]?.damage).toBe(140_500);
  });

  it('counts an AoE meteor once, not once per target', () => {
    // 一颗流星命中 5 个目标 = 5 条同刻事件，但只是一次撞击。
    const events = [
      ...[10, 11, 12, 13, 14].map((target) =>
        damage(1_000, METEOR, 'Voidfall Meteor', 8_000, 'normal', 1, target),
      ),
      ...[10, 11, 12, 13, 14].map((target) =>
        damage(1_350, WORLD_KILLER, 'World Killer', 12_000, 'normal', 1, target),
      ),
    ];
    const volleys = collectMeteorVolleys(events, 1, IDS);
    expect(volleys).toHaveLength(1);
    expect(volleys[0]?.impacts).toBe(2);
    expect(volleys[0]?.damageEvents).toBe(10);
    expect(volleys[0]?.targets).toBe(5);
    expect(volleys[0]?.damage).toBe(100_000);
  });

  it('merges hits that share the same millisecond (documented limitation)', () => {
    // 实战日志里同一次撞击会被减伤拆成多条（block / absorb），也可能是两次撞击
    // 恰好落在同一毫秒（B 组）。两者无法从事件区分，一律按「一次撞击」处理 ——
    // 所以颗数只会低估、不会虚高。这是刻意的取舍。
    const events = [
      damage(1_000, METEOR, 'Voidfall Meteor', 42_000),
      damage(1_320, METEOR, 'Voidfall Meteor', 43_000),
      damage(1_320, METEOR, 'Voidfall Meteor', 42_200),
      damage(2_000, WORLD_KILLER, 'World Killer', 66_000),
    ];
    const volleys = collectMeteorVolleys(events, 1, IDS);
    expect(volleys).toHaveLength(1);
    expect(volleys[0]?.impacts).toBe(3);
    expect(volleys[0]?.damageEvents).toBe(4);
    expect(volleys[0]?.damage).toBe(193_200);
  });

  it('splits chains more than 700ms apart and ignores other players', () => {
    const events = [
      damage(1_000, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_350, WORLD_KILLER, 'World Killer', 60_000),
      damage(3_000, METEOR, 'Voidfall Meteor', 41_000),
      damage(3_350, WORLD_KILLER, 'World Killer', 61_000),
      damage(3_400, METEOR, 'Voidfall Meteor', 99_000, 'normal', 2),
    ];
    const volleys = collectMeteorVolleys(events, 1, IDS);
    expect(volleys.map((volley) => volley.impacts)).toEqual([2, 2]);
  });

  it('always sums `amount` and marks overkill-clamped rows instead of swapping fields', () => {
    // 假人濒死：amount 被钳成 1 —— 伤害不可用，但也不拿 unmitigated 顶替
    const clamped = [
      { ...damage(1_000, METEOR, 'Voidfall Meteor', 1), unmitigatedAmount: 40_050, overkill: 9_000 },
      { ...damage(1_350, WORLD_KILLER, 'World Killer', 1), unmitigatedAmount: 60_064, overkill: 9_000 },
    ];
    expect(collectMeteorVolleys(clamped, 1, IDS)[0]?.damage).toBe(2);
    expect(clamped.every((event) => isOverkillClamped(event))).toBe(true);

    // 真实目标：amount 就是实际伤害，即使小于 unmitigated
    const real = [
      { ...damage(2_000, METEOR, 'Voidfall Meteor', 30_752), unmitigatedAmount: 90_824 },
      { ...damage(2_350, WORLD_KILLER, 'World Killer', 46_937), unmitigatedAmount: 46_937 },
    ];
    expect(collectMeteorVolleys(real, 1, IDS)[0]?.damage).toBe(77_689);
    expect(real.some((event) => isOverkillClamped(event))).toBe(false);
  });
});

describe('summarizeVolleys', () => {
  it('only counts consumed stacks on single-target volleys', () => {
    const events = [
      // 单目标 3 撞击
      damage(1_000, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_350, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_700, WORLD_KILLER, 'World Killer', 60_000),
      // 多目标 2 撞击（不该计入层数）
      ...[10, 11].map((target) =>
        damage(5_000, METEOR, 'Voidfall Meteor', 9_000, 'normal', 1, target),
      ),
      ...[10, 11].map((target) =>
        damage(5_300, WORLD_KILLER, 'World Killer', 14_000, 'normal', 1, target),
      ),
    ];
    const summary = summarizeVolleys(collectMeteorVolleys(events, 1, IDS));
    expect(summary.volleys).toBe(2);
    expect(summary.impacts).toBe(5);
    expect(summary.singleTargetStacks).toBe(3);
    expect(summary.sizeHistogram).toEqual({ '3': 1, '2': 1 });
  });

  it('flags a four-impact single-target volley (bomb + instant cleave merge)', () => {
    const events = [
      damage(1_000, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_300, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_600, METEOR, 'Voidfall Meteor', 40_000),
      damage(1_900, WORLD_KILLER, 'World Killer', 60_000),
    ];
    const summary = summarizeVolleys(collectMeteorVolleys(events, 1, IDS));
    expect(summary.fourHitVolleys).toBe(1);
  });
});

describe('darkMatterMissingRule', () => {
  const meta = (timestamp: number) => cast(timestamp, META, 'Metamorphosis');
  const bomb = (timestamp: number) => cast(timestamp, BOMB, 'Spirit Bomb');
  const shower = (from: number, ticks: number) =>
    Array.from({ length: ticks }, (unused, index) =>
      damage(from + index * 500, SHOWER, 'Meteor Shower', 7_000),
    );

  it('flags a metamorphosis-first-bomb that produced no shower at all', () => {
    const events = [meta(1_000), bomb(2_000)];
    const findings = darkMatterMissingRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 30_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('vdh.dark_matter_missing');
    expect(findings[0]?.severity).toBe('low');
    // 机制缺失不是操作失误：不产 verdict。
    expect(findings[0]?.verdict).toBeUndefined();
    expect(findings[0]?.actual).toMatchObject({ ticks: 0, checked: 1 });
  });

  it('stays silent when the 12-tick shower is present', () => {
    const events = [meta(1_000), bomb(2_000), ...shower(2_500, 12)];
    const findings = darkMatterMissingRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 30_000 }),
    );
    expect(findings).toHaveLength(0);
  });

  it('stays silent when no bomb was cast during metamorphosis (resource decision)', () => {
    const events = [meta(1_000)];
    const findings = darkMatterMissingRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 30_000 }),
    );
    expect(findings).toHaveLength(0);
  });

  it('ignores bombs cast outside the metamorphosis window', () => {
    const events = [meta(1_000), bomb(40_000)];
    const findings = darkMatterMissingRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 60_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('VengeanceDemonHunterAnalyzer', () => {
  it('reports meteor volleys and dark matter ticks as metrics', () => {
    const events = [
      cast(1_000, META, 'Metamorphosis'),
      cast(2_000, BOMB, 'Spirit Bomb'),
      damage(2_500, METEOR, 'Voidfall Meteor', 40_000),
      damage(2_900, METEOR, 'Voidfall Meteor', 40_000),
      damage(3_300, WORLD_KILLER, 'World Killer', 60_000),
      ...Array.from({ length: 12 }, (unused, index) =>
        damage(2_600 + index * 500, SHOWER, 'Meteor Shower', 7_000),
      ),
    ];
    const result = new VengeanceDemonHunterAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 30_000 }),
    );
    expect(result.spec).toBe('Vengeance Demon Hunter');
    const meteors = result.metrics['meteors'] as {
      volleys: number;
      singleTargetStacks: number;
      damage: number;
    };
    expect(meteors.volleys).toBe(1);
    expect(meteors.singleTargetStacks).toBe(3);
    expect(meteors.damage).toBe(140_000);
    const darkMatter = result.metrics['darkMatter'] as { ticks: number; damage: number };
    expect(darkMatter.ticks).toBe(12);
    expect(darkMatter.damage).toBe(84_000);
    expect(result.findings).toHaveLength(0);
  });

  it('never invents stack-based findings (priority stays empty)', () => {
    const result = new VengeanceDemonHunterAnalyzer().analyze(
      makeContext({ events: [], fightStart: 0, fightEnd: 10_000 }),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.metrics['ruleIds']).toEqual(['vdh.dark_matter_missing']);
  });
});
