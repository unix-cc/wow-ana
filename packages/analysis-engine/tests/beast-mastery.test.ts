import { describe, it, expect } from 'vitest';
import { BeastMasteryAnalyzer } from '../src/specs/hunter/beast-mastery/analyzer.js';
import { SpecRegistry } from '../src/specs/registry.js';
import {
  killCommandUsageRule,
  barbedShotUptimeRule,
  beastCleaveUptimeRule,
  cooldownDelayRule,
  gcdIdleRule,
} from '../src/specs/hunter/beast-mastery/rules/index.js';
import { BM_ABILITIES } from '../src/specs/hunter/beast-mastery/constants.js';
import { makeContext, cast, buff } from './helpers.js';

describe('killCommandUsageRule', () => {
  it('flags heavy under-use of Kill Command', () => {
    const events = [
      cast(0, BM_ABILITIES.killCommand.abilityId, 'Kill Command'),
    ];
    const findings = killCommandUsageRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('bm_hunter.kill_command_usage');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.evidence.length).toBeGreaterThan(0);
  });

  it('stays silent when Kill Command is used on cooldown', () => {
    const events = Array.from({ length: 14 }, (_, i) =>
      cast(i * 6_000, BM_ABILITIES.killCommand.abilityId, 'Kill Command'),
    );
    const findings = killCommandUsageRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });

  it('skips very short fights', () => {
    const findings = killCommandUsageRule.evaluate(
      makeContext({ fightStart: 0, fightEnd: 10_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('cooldownDelayRule', () => {
  it('flags delayed Bestial Wrath casts', () => {
    const events = [
      cast(0, BM_ABILITIES.bestialWrath.abilityId, 'Bestial Wrath'),
      cast(100_000, BM_ABILITIES.bestialWrath.abilityId, 'Bestial Wrath'),
      cast(200_000, BM_ABILITIES.bestialWrath.abilityId, 'Bestial Wrath'),
    ];
    const findings = cooldownDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('bm_hunter.cooldown_delay');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.evidence[0]?.unit).toBe('ms');
  });

  it('stays silent for on-cooldown Bestial Wrath casts', () => {
    const events = [
      cast(0, BM_ABILITIES.bestialWrath.abilityId, 'Bestial Wrath'),
      cast(90_000, BM_ABILITIES.bestialWrath.abilityId, 'Bestial Wrath'),
      cast(180_000, BM_ABILITIES.bestialWrath.abilityId, 'Bestial Wrath'),
    ];
    const findings = cooldownDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('barbedShotUptimeRule', () => {
  it('flags long Barbed Shot buff downtime', () => {
    const events = [
      buff(
        0,
        'applybuff',
        BM_ABILITIES.barbedShotBuff.abilityId,
        'Barbed Shot',
      ),
      buff(
        40_000,
        'removebuff',
        BM_ABILITIES.barbedShotBuff.abilityId,
        'Barbed Shot',
      ),
    ];
    const findings = barbedShotUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('bm_hunter.barbed_shot_uptime');
    expect(findings[0]?.severity).toBe('high');
  });

  it('stays silent with near-full coverage', () => {
    const events = [
      buff(
        0,
        'applybuff',
        BM_ABILITIES.barbedShotBuff.abilityId,
        'Barbed Shot',
      ),
      buff(
        100_000,
        'removebuff',
        BM_ABILITIES.barbedShotBuff.abilityId,
        'Barbed Shot',
      ),
    ];
    const findings = barbedShotUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('beastCleaveUptimeRule', () => {
  it('flags low Beast Cleave uptime in a multi-target fight', () => {
    const events = [
      cast(0, BM_ABILITIES.multiShot.abilityId, 'Multi-Shot'),
      buff(0, 'applybuff', BM_ABILITIES.beastCleave.abilityId, 'Beast Cleave'),
      buff(
        10_000,
        'removebuff',
        BM_ABILITIES.beastCleave.abilityId,
        'Beast Cleave',
      ),
    ];
    const findings = beastCleaveUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('bm_hunter.beast_cleave_uptime');
    expect(findings[0]?.severity).toBe('high');
  });

  it('skips single-target fights with no Multi-Shot', () => {
    const findings = beastCleaveUptimeRule.evaluate(
      makeContext({ fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('gcdIdleRule', () => {
  it('flags excessive idle time', () => {
    const events = [cast(0, 1, 'Cobra Shot'), cast(2_000, 1, 'Cobra Shot')];
    const findings = gcdIdleRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('bm_hunter.gcd_idle');
    expect(findings[0]?.severity).toBe('high');
  });

  it('stays silent with a tight rotation', () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      cast(i * 2_000, 1, 'Cobra Shot'),
    );
    const findings = gcdIdleRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('BeastMasteryAnalyzer', () => {
  it('reports spec metadata and runs all rules', () => {
    const analyzer = new BeastMasteryAnalyzer();
    const result = analyzer.analyze(
      makeContext({ fightStart: 0, fightEnd: 100_000 }),
    );
    expect(result.spec).toBe('Beast Mastery Hunter');
    const metrics = result.metrics as {
      bmCooldowns: unknown[];
      ruleIds: string[];
    };
    expect(metrics.bmCooldowns).toHaveLength(2);
    expect(metrics.ruleIds).toHaveLength(5);
  });
});

describe('SpecRegistry', () => {
  it('matches Beast Mastery players by spec name', () => {
    const registry = new SpecRegistry();
    const analyzer = registry.findForPlayer({
      id: 1,
      name: 'Hero',
      type: 'Player',
      specName: 'Beast Mastery',
    });
    expect(analyzer).toBeDefined();
    expect(analyzer?.getSpec()).toBe('Beast Mastery Hunter');
  });

  it('matches Beast Mastery players by spec id', () => {
    const registry = new SpecRegistry();
    const analyzer = registry.findForPlayer({
      id: 1,
      name: 'Hero',
      type: 'Player',
      specId: 253,
    });
    expect(analyzer).toBeDefined();
  });

  it('returns undefined for unknown specs', () => {
    const registry = new SpecRegistry();
    const analyzer = registry.findForPlayer({
      id: 1,
      name: 'Hero',
      type: 'Player',
      specName: 'Restoration',
    });
    expect(analyzer).toBeUndefined();
  });
});
