import { describe, it, expect } from 'vitest';
import { killCommandUsageRule } from '../src/specs/hunter/beast-mastery/rules/kill-command.js';
import { barbedShotUptimeRule } from '../src/specs/hunter/beast-mastery/rules/barbed-shot-uptime.js';
import { clearcastingWasteRule } from '../src/specs/mage/arcane/rules/clearcasting-waste.js';
import { arcaneSurgeDelayRule } from '../src/specs/mage/arcane/rules/arcane-surge-delay.js';
import { makeContext, cast, buff } from './helpers.js';

/**
 * Phase F assertions: comparison rules now stamp confidence / expected /
 * actual and traceable evidence (fightId + expected-vs-actual timepoints).
 * Threshold numbers are untouched — these are metadata additions only.
 */
describe('Phase F finding metadata on real rules', () => {
  it('kill command usage carries knowledge confidence and expected-slot evidence', () => {
    // 100s fight, one Kill Command cast at t=0 → far below the 17 expected.
    const findings = killCommandUsageRule.evaluate(
      makeContext({
        fightStart: 0,
        fightEnd: 100_000,
        events: [cast(0, 34026, 'Kill Command')],
      }),
    );
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.confidence).toBe(0.9);
    expect(finding?.expected).toMatchObject({
      ability: '杀戮命令 (Kill Command)',
      cooldownMs: 6_000,
      expectedCasts: 17,
    });
    expect(finding?.actual).toMatchObject({ casts: 1, missed: 16 });
    expect(finding?.evidence[0]).toMatchObject({
      timestamp: 0,
      expectedAt: 0,
      fightId: 8,
      note: 'actual cast vs expected 6s cadence',
    });
  });

  it('barbed shot uptime carries the knowledge confidence and target', () => {
    const findings = barbedShotUptimeRule.evaluate(
      makeContext({
        fightStart: 0,
        fightEnd: 100_000,
        events: [
          buff(0, 'applybuff', 246152, 'Barbed Shot'),
          buff(10_000, 'removebuff', 246152, 'Barbed Shot'),
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe(0.8);
    expect(findings[0]?.expected).toMatchObject({ targetUptime: 0.8 });
    expect(findings[0]?.actual).toMatchObject({ uptime: 0.1 });
    expect(findings[0]?.evidence[0]).toMatchObject({ fightId: 8, value: 0.1 });
  });

  it('clearcasting waste carries knowledge confidence and proc-time evidence', () => {
    const procs = Array.from({ length: 12 }, (_, i) =>
      buff(i * 1000, 'applybuff', 263725, 'Clearcasting'),
    );
    const missiles = [0, 1, 2, 3].map((i) => cast(i * 5000, 5143, 'Arcane Missiles'));
    const findings = clearcastingWasteRule.evaluate(
      makeContext({ fightStart: 0, fightEnd: 60_000, events: [...procs, ...missiles] }),
    );
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.confidence).toBe(0.8);
    expect(finding?.expected).toMatchObject({ ability: '飞弹 (Arcane Missiles)' });
    expect(finding?.actual).toMatchObject({ procs: 12, missiles: 4, wasted: 8 });
    expect(finding?.evidence[0]).toMatchObject({
      fightId: 8,
      note: 'clearcasting proc not consumed',
    });
  });

  it('arcane surge delay evidence carries the actual-vs-ideal timepoint pair', () => {
    const findings = arcaneSurgeDelayRule.evaluate(
      makeContext({
        fightStart: 0,
        fightEnd: 200_000,
        events: [
          cast(0, 365350, 'Arcane Surge'),
          cast(130_000, 365350, 'Arcane Surge'), // ideal slot 90s → 40s late
        ],
      }),
    );
    expect(findings).toHaveLength(1);
    const evidence = findings[0]?.evidence ?? [];
    expect(evidence).toHaveLength(2);
    expect(evidence[1]).toMatchObject({
      timestamp: 130_000,
      expectedAt: 90_000,
      value: 40_000,
      fightId: 8,
    });
  });
});
