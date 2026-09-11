import { describe, it, expect } from 'vitest';
import { ArcaneMageAnalyzer } from '../src/specs/mage/arcane/analyzer.js';
import { arcaneSurgeDelayRule } from '../src/specs/mage/arcane/rules/arcane-surge-delay.js';
import { gcdIdleRule } from '../src/specs/mage/arcane/rules/gcd-idle.js';
import { makeContext, cast } from './helpers.js';
import { ARCANE_ABILITIES } from '../src/specs/mage/arcane/constants.js';

const AS = ARCANE_ABILITIES.arcaneSurge.abilityId;
const MS = ARCANE_ABILITIES.arcaneMissiles.abilityId;

const MPLUS_ZONE = 'Mythic+ Season 2';

describe('arcaneSurgeDelayRule mythic+ awareness', () => {
  it('keys on Arcane Surge and ignores the removed Arcane Power (12042)', () => {
    // Regression for the stale-knowledge bug: a current-patch log never
    // contains Arcane Power (12042). The rule must watch Arcane Surge
    // (365350) only — the 12042 casts count for nothing, and real Surge
    // casts on cooldown stay silent.
    const events = [
      cast(0, 12042, 'Arcane Power'),
      cast(90_000, 365350, 'Arcane Surge'),
      cast(180_000, 365350, 'Arcane Surge'),
    ];
    const findings = arcaneSurgeDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(0);
  });

  it('flags a real zero-use Arcane Surge over a long raid fight as high', () => {
    // 10-minute single boss fight with no Surge → expectedCasts =
    // floor(600s/90s) = 6, still an accusation in a raid context.
    const events = [cast(0, MS, 'Arcane Missiles')];
    const findings = arcaneSurgeDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 600_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.title).toContain('基本未使用');
  });
});

describe('gcdIdleRule mythic+ gate (arcane)', () => {
  it('stays silent in a Mythic+ run despite long cast gaps', () => {
    const events = [cast(0, MS, 'Arcane Missiles'), cast(90_000, MS, 'Arcane Missiles')];
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

describe('ArcaneMageAnalyzer mythic+ adjustments', () => {
  it('downgrades a zero-use Arcane Surge finding to low in a dungeon', () => {
    // Whole-dungeon run (~10 min): Surge used once at t=0 → the fixed-CD
    // model would claim 6 theoretical uses. The analyzer must soften it.
    const events = [cast(0, AS, 'Arcane Surge')];
    const analyzer = new ArcaneMageAnalyzer();
    const result = analyzer.analyze(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 600_000,
        zoneName: MPLUS_ZONE,
        fightDifficulty: 10,
      }),
    );
    const surge = result.findings.find(
      (f) => f.id === 'arcane_mage.arcane_surge_delay',
    );
    expect(surge).toBeDefined();
    expect(surge?.severity).toBe('low');
    expect(surge?.description).toContain('大秘境');
    // GCD idle rule stays gated off for whole-dungeon fights.
    expect(
      result.findings.some((f) => f.id === 'arcane_mage.gcd_idle'),
    ).toBe(false);
  });

  it('keeps high severity for a zero-use Surge in a raid fight', () => {
    const events = [cast(0, AS, 'Arcane Surge')];
    const analyzer = new ArcaneMageAnalyzer();
    const result = analyzer.analyze(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 600_000,
        zoneName: 'Nerub-ar Palace',
      }),
    );
    const surge = result.findings.find(
      (f) => f.id === 'arcane_mage.arcane_surge_delay',
    );
    expect(surge).toBeDefined();
    expect(surge?.severity).toBe('high');
  });
});
