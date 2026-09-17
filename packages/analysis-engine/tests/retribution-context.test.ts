import { describe, it, expect } from 'vitest';
import { RetributionPaladinAnalyzer } from '../src/specs/paladin/retribution/analyzer.js';
import { makeContext, cast } from './helpers.js';
import { RETRIBUTION_ABILITIES } from '../src/specs/paladin/retribution/constants.js';

const AW = RETRIBUTION_ABILITIES.avengingWrath;
const ES = RETRIBUTION_ABILITIES.executionSentence;
const WOA = RETRIBUTION_ABILITIES.wakeOfAshes;

const MPLUS_ZONE = 'Mythic+ Season 2';

describe('RetributionPaladinAnalyzer', () => {
  it('flags a delayed Avenging Wrath in a raid fight', () => {
    // 300s fight, 2-min CD → ideal slots at 0/120/240; casting at
    // 30/170/285 gives an average delay of ~42s (high).
    const events = [
      cast(30_000, AW.abilityId, AW.abilityName),
      cast(170_000, AW.abilityId, AW.abilityName),
      cast(285_000, AW.abilityId, AW.abilityName),
    ];
    const result = new RetributionPaladinAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    const finding = result.findings.find(
      (f) => f.id === 'retribution_paladin.avenging_wrath_delay',
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('high');
    expect(finding?.confidence).toBe(0.9);
    expect(result.metrics.knowledgeVersion).toBe('1.1.0');
  });

  it('stays silent when cooldowns are used on time', () => {
    const events = [
      cast(1_000, AW.abilityId, AW.abilityName),
      cast(121_000, AW.abilityId, AW.abilityName),
      cast(2_000, ES.abilityId, ES.abilityName),
      cast(62_000, ES.abilityId, ES.abilityName),
      cast(3_000, WOA.abilityId, WOA.abilityName),
      cast(48_000, WOA.abilityId, WOA.abilityName),
    ];
    const result = new RetributionPaladinAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 130_000 }),
    );
    expect(
      result.findings.some((f) => f.id.endsWith('_delay')),
    ).toBe(false);
  });

  it('flags an unused Execution Sentence in a raid fight', () => {
    // 5-min fight, 60s CD → 5 expected casts, zero actual.
    const events = [cast(10_000, WOA.abilityId, WOA.abilityName)];
    const result = new RetributionPaladinAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    const finding = result.findings.find(
      (f) => f.id === 'retribution_paladin.execution_sentence_delay',
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('high');
    expect(finding?.title).toContain('基本未使用');
  });

  it('downgrades zero-cast cooldown findings to low with a talent caveat in Mythic+', () => {
    // 10-min dungeon run: nothing but fillers cast.
    const events = [
      cast(10_000, RETRIBUTION_ABILITIES.bladeOfJustice.abilityId, 'Blade of Justice'),
      cast(20_000, RETRIBUTION_ABILITIES.divineStorm.abilityId, 'Divine Storm'),
    ];
    const result = new RetributionPaladinAnalyzer().analyze(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 600_000,
        zoneName: MPLUS_ZONE,
        fightDifficulty: 10,
      }),
    );
    for (const id of [
      'retribution_paladin.avenging_wrath_delay',
      'retribution_paladin.execution_sentence_delay',
      'retribution_paladin.wake_of_ashes_delay',
    ]) {
      const finding = result.findings.find((f) => f.id === id);
      expect(finding, id).toBeDefined();
      expect(finding?.severity).toBe('low');
      expect(finding?.description).toContain('天赋');
    }
    // The whole-dungeon GCD model stays gated off.
    expect(
      result.findings.some((f) => f.id === 'retribution_paladin.gcd_idle'),
    ).toBe(false);
  });
});
