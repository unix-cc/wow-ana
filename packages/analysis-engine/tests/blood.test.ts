import { describe, it, expect } from 'vitest';
import { BloodDeathKnightAnalyzer } from '../src/specs/death-knight/blood/analyzer.js';
import { boneShieldUptimeRule } from '../src/specs/death-knight/blood/rules/bone-shield-uptime.js';
import { vampiricBloodDelayRule } from '../src/specs/death-knight/blood/rules/vampiric-blood-delay.js';
import { dancingRuneWeaponDelayRule } from '../src/specs/death-knight/blood/rules/dancing-rune-weapon-delay.js';
import { makeContext, cast, buff } from './helpers.js';
import { BLOOD_ABILITIES } from '../src/specs/death-knight/blood/constants.js';

const BS = BLOOD_ABILITIES.boneShield.abilityId;
const VB = BLOOD_ABILITIES.vampiricBlood.abilityId;
const DRW = BLOOD_ABILITIES.dancingRuneWeapon.abilityId;

describe('boneShieldUptimeRule', () => {
  it('flags low Bone Shield uptime', () => {
    const events = [
      buff(0, 'applybuff', BS, 'Bone Shield'),
      buff(30_000, 'removebuff', BS, 'Bone Shield'),
    ];
    const findings = boneShieldUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('blood_dk.bone_shield_uptime');
  });

  it('stays silent with a maintained Bone Shield', () => {
    const events = [
      buff(0, 'applybuff', BS, 'Bone Shield'),
      buff(100_000, 'removebuff', BS, 'Bone Shield'),
    ];
    const findings = boneShieldUptimeRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('vampiricBloodDelayRule', () => {
  it('reports delayed Vampiric Blood as a low-severity reference (reactive defensive)', () => {
    const events = [
      cast(0, VB, 'Vampiric Blood'),
      cast(140_000, VB, 'Vampiric Blood'),
      cast(280_000, VB, 'Vampiric Blood'),
    ];
    const findings = vampiricBloodDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding?.id).toBe('blood_dk.vampiric_blood_delay');
    // Reactive defensive: capped at low, worded as a reference — never an
    // accusation (the knowledge documents tank usage as fight-driven).
    expect(finding?.severity).toBe('low');
    expect(finding?.title).toContain('参考');
    expect(finding?.recommendation).toContain('参考');
  });

  it('caps the never-used branch at low for defensives too', () => {
    // 300s fight, 120s CD → expected 2; 0 casts never triggers the branch
    // (needs >= 3 expected). 480s fight → expected 4, zero casts.
    const findings = vampiricBloodDelayRule.evaluate(
      makeContext({ events: [], fightStart: 0, fightEnd: 480_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.title).toContain('偏少');
  });
});

describe('dancingRuneWeaponDelayRule', () => {
  it('reports delayed Dancing Rune Weapon as a low-severity reference', () => {
    const events = [
      cast(0, DRW, 'Dancing Rune Weapon'),
      cast(260_000, DRW, 'Dancing Rune Weapon'),
    ];
    const findings = dancingRuneWeaponDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('blood_dk.dancing_rune_weapon_delay');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.title).toContain('参考');
  });
});

describe('BloodDeathKnightAnalyzer', () => {
  it('reports spec metadata and runs all rules', () => {
    const analyzer = new BloodDeathKnightAnalyzer();
    const result = analyzer.analyze(
      makeContext({ fightStart: 0, fightEnd: 100_000 }),
    );
    expect(result.spec).toBe('Blood Death Knight');
    const metrics = result.metrics as { ruleIds: string[] };
    expect(metrics.ruleIds).toHaveLength(4);
  });

  it('skips the defensive-cooldown delay rules in a Mythic+ run', () => {
    // Real-log regression (fXdMjWKJbpna6yHv): a whole-dungeon run made the
    // slot model produce "DRW delayed 30s (high)" for a tank who pressed it
    // 15 times against danger windows. In Mythic+ those rules stay silent.
    const events = [
      cast(0, VB, 'Vampiric Blood'),
      cast(140_000, VB, 'Vampiric Blood'),
      cast(0, DRW, 'Dancing Rune Weapon'),
      cast(260_000, DRW, 'Dancing Rune Weapon'),
    ];
    const analyzer = new BloodDeathKnightAnalyzer();
    const result = analyzer.analyze(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 300_000,
        zoneName: 'Mythic+ Season 2',
        fightDifficulty: 10,
      }),
    );
    const metrics = result.metrics as { ruleIds: string[] };
    expect(metrics.ruleIds).not.toContain('blood_dk.vampiric_blood_delay');
    expect(metrics.ruleIds).not.toContain('blood_dk.dancing_rune_weapon_delay');
    expect(
      result.findings.some((f) => f.id.startsWith('blood_dk.') && f.id.endsWith('_delay')),
    ).toBe(false);
    // Bone shield / gcd rules stay in the list (they gate themselves).
    expect(metrics.ruleIds).toContain('blood_dk.bone_shield_uptime');
  });
});
