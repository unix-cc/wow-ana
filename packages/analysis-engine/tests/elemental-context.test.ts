import { describe, it, expect } from 'vitest';
import { ElementalShamanAnalyzer } from '../src/specs/shaman/elemental/analyzer.js';
import { flameShockUptimeRule } from '../src/specs/shaman/elemental/rules/flame-shock-uptime.js';
import { gcdIdleRule } from '../src/specs/shaman/elemental/rules/gcd-idle.js';
import { isMythicPlusRun } from '../src/fight-context.js';
import { makeContext, cast, damage, debuff } from './helpers.js';
import { ELEMENTAL_ABILITIES } from '../src/specs/shaman/elemental/constants.js';

const FS = ELEMENTAL_ABILITIES.flameShock.abilityId;
const SK = ELEMENTAL_ABILITIES.stormkeeper.abilityId;

const MPLUS_ZONE = 'Mythic+ Season 2';

describe('isMythicPlusRun', () => {
  it('detects Mythic+ zones regardless of case/spacing', () => {
    const ctx = makeContext({ zoneName: 'Mythic+ Season 2' });
    expect(isMythicPlusRun(ctx.report, ctx.fight)).toBe(true);
  });

  it('returns false for raid zones', () => {
    const ctx = makeContext({ zoneName: 'Nerub-ar Palace' });
    expect(isMythicPlusRun(ctx.report, ctx.fight)).toBe(false);
  });
});

describe('flameShockUptimeRule mythic+ gate', () => {
  it('stays silent in a Mythic+ run even with a low debuff coverage', () => {
    // Same event shape that used to produce a bogus 0%/low-uptime finding:
    // short Flame Shock window inside a whole-dungeon fight.
    const events = [
      debuff(0, 'applydebuff', FS, 'Flame Shock'),
      debuff(20_000, 'removedebuff', FS, 'Flame Shock'),
    ];
    const findings = flameShockUptimeRule.evaluate(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 100_000,
        zoneName: MPLUS_ZONE,
        fightDifficulty: 10,
      }),
    );
    expect(findings).toHaveLength(0);
  });

  it('measures uptime from the damage-tick chain in a raid fight', () => {
    // Maintained Flame Shock: ticks every 3s from 0 to 90s of a 100s fight.
    const events = Array.from({ length: 31 }, (_, i) =>
      damage(i * 3_000, FS, 'Flame Shock', 1_000, 'normal', 1, 2),
    );
    const findings = flameShockUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });

  it('flags a dropped Flame Shock via the damage chain in a raid fight', () => {
    // Active 0-30s and 70-100s with a long gap in the middle.
    const events = [
      ...Array.from({ length: 11 }, (_, i) =>
        damage(i * 3_000, FS, 'Flame Shock', 1_000, 'normal', 1, 2),
      ),
      ...Array.from({ length: 11 }, (_, i) =>
        damage(70_000 + i * 3_000, FS, 'Flame Shock', 1_000, 'normal', 1, 2),
      ),
    ];
    const findings = flameShockUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('elemental_shaman.flame_shock_uptime');
  });

  it('stays silent when there is no Flame Shock signal at all', () => {
    const findings = flameShockUptimeRule.evaluate(
      makeContext({ events: [], fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('gcdIdleRule mythic+ gate', () => {
  it('stays silent in a Mythic+ run despite long cast gaps', () => {
    const events = [cast(0, SK, 'Stormkeeper'), cast(90_000, SK, 'Stormkeeper')];
    const findings = gcdIdleRule.evaluate(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 100_000,
        zoneName: MPLUS_ZONE,
        fightDifficulty: 10,
      }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('ElementalShamanAnalyzer mythic+ adjustments', () => {
  it('downgrades the unused Fire Elemental finding to low with a talent caveat', () => {
    // 10-minute dungeon run: Stormkeeper used on time, Fire Elemental never
    // (expectedCasts = floor(600s/120s) = 5 → would normally be high).
    const events = [
      cast(0, SK, 'Stormkeeper'),
      cast(300_000, SK, 'Stormkeeper'),
    ];
    const analyzer = new ElementalShamanAnalyzer();
    const result = analyzer.analyze(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 600_000,
        zoneName: MPLUS_ZONE,
        fightDifficulty: 10,
      }),
    );
    const fire = result.findings.find(
      (f) => f.id === 'elemental_shaman.fire_elemental_delay',
    );
    expect(fire).toBeDefined();
    expect(fire?.severity).toBe('low');
    expect(fire?.description).toContain('天赋');
    // Whole-dungeon rules are fully gated off in Mythic+.
    expect(
      result.findings.some(
        (f) => f.id === 'elemental_shaman.flame_shock_uptime',
      ),
    ).toBe(false);
    expect(
      result.findings.some((f) => f.id === 'elemental_shaman.gcd_idle'),
    ).toBe(false);
  });
});
