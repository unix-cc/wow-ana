import { describe, it, expect } from 'vitest';
import { ElementalShamanAnalyzer } from '../src/specs/shaman/elemental/analyzer.js';
import { flameShockUptimeRule } from '../src/specs/shaman/elemental/rules/flame-shock-uptime.js';
import { lavaSurgeWasteRule } from '../src/specs/shaman/elemental/rules/lava-surge-waste.js';
import { stormkeeperDelayRule } from '../src/specs/shaman/elemental/rules/stormkeeper-delay.js';
import { makeContext, cast, buff, debuff } from './helpers.js';
import { ELEMENTAL_ABILITIES } from '../src/specs/shaman/elemental/constants.js';

const FS = ELEMENTAL_ABILITIES.flameShock.abilityId;
const LB = ELEMENTAL_ABILITIES.lavaBurst.abilityId;
const SK = ELEMENTAL_ABILITIES.stormkeeper.abilityId;
const LS = ELEMENTAL_ABILITIES.lavaSurge.abilityId;

describe('flameShockUptimeRule', () => {
  it('flags low Flame Shock uptime', () => {
    const events = [
      debuff(0, 'applydebuff', FS, 'Flame Shock'),
      debuff(20_000, 'removedebuff', FS, 'Flame Shock'),
    ];
    const findings = flameShockUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('elemental_shaman.flame_shock_uptime');
  });

  it('stays silent with a maintained Flame Shock', () => {
    const events = [
      debuff(0, 'applydebuff', FS, 'Flame Shock'),
      debuff(100_000, 'removedebuff', FS, 'Flame Shock'),
    ];
    const findings = flameShockUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('lavaSurgeWasteRule', () => {
  it('flags wasted Lava Surge procs', () => {
    const events = [
      ...Array.from({ length: 20 }, (_, i) =>
        buff(i * 5_000, 'applybuff', LS, 'Lava Surge'),
      ),
      ...Array.from({ length: 6 }, (_, i) => cast(i * 1000, LB, 'Lava Burst')),
    ];
    const findings = lavaSurgeWasteRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('elemental_shaman.lava_surge_waste');
  });
});

describe('stormkeeperDelayRule', () => {
  it('flags delayed Stormkeeper casts', () => {
    const events = [
      cast(0, SK, 'Stormkeeper'),
      cast(80_000, SK, 'Stormkeeper'),
      cast(160_000, SK, 'Stormkeeper'),
    ];
    const findings = stormkeeperDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 200_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('elemental_shaman.stormkeeper_delay');
  });

  it('stays silent for on-cooldown casts', () => {
    const events = [
      cast(0, SK, 'Stormkeeper'),
      cast(60_000, SK, 'Stormkeeper'),
      cast(120_000, SK, 'Stormkeeper'),
    ];
    const findings = stormkeeperDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 200_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('ElementalShamanAnalyzer', () => {
  it('reports spec metadata and runs all rules', () => {
    const analyzer = new ElementalShamanAnalyzer();
    const result = analyzer.analyze(
      makeContext({ fightStart: 0, fightEnd: 100_000 }),
    );
    expect(result.spec).toBe('Elemental Shaman');
    const metrics = result.metrics as { ruleIds: string[] };
    expect(metrics.ruleIds).toHaveLength(5);
  });
});
