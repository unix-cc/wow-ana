import { describe, it, expect } from 'vitest';
import { ArmsWarriorAnalyzer } from '../src/specs/warrior/arms/analyzer.js';
import { makeContext, cast } from './helpers.js';
import { ARMS_ABILITIES } from '../src/specs/warrior/arms/constants.js';

const CS = ARMS_ABILITIES.colossusSmash;
const AV = ARMS_ABILITIES.avatar;
const BS = ARMS_ABILITIES.bladestorm;

const MPLUS_ZONE = 'Mythic+ Season 2';

describe('ArmsWarriorAnalyzer', () => {
  it('flags a delayed Colossus Smash in a raid fight', () => {
    // 240s fight, 45s CD → ideal slots every 45s; casting ~20s late each
    // time gives sustained delay.
    const events = [
      cast(60_000, CS.abilityId, CS.abilityName),
      cast(125_000, CS.abilityId, CS.abilityName),
      cast(190_000, CS.abilityId, CS.abilityName),
    ];
    const result = new ArmsWarriorAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 240_000 }),
    );
    const finding = result.findings.find(
      (f) => f.id === 'arms_warrior.colossus_smash_delay',
    );
    expect(finding).toBeDefined();
    expect(finding?.confidence).toBe(0.9);
    expect(result.metrics.knowledgeVersion).toBe('1.2.0');
  });

  it('does not penalize early Colossus Smash casts (Tactician resets)', () => {
    // Tactician/Anger Management make real intervals SHORTER than 45s —
    // casts at 0/30/60/90 (30s apart) must never read as delays.
    const events = Array.from({ length: 7 }, (_, i) =>
      cast(i * 30_000, CS.abilityId, CS.abilityName),
    );
    const result = new ArmsWarriorAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 240_000 }),
    );
    expect(
      result.findings.some((f) => f.id === 'arms_warrior.colossus_smash_delay'),
    ).toBe(false);
  });

  it('stays silent when cooldowns are used on time', () => {
    const events = [
      cast(2_000, CS.abilityId, CS.abilityName),
      cast(47_000, CS.abilityId, CS.abilityName),
      cast(3_000, AV.abilityId, AV.abilityName),
      cast(93_000, AV.abilityId, AV.abilityName),
      cast(2_000, BS.abilityId, BS.abilityName),
      cast(92_000, BS.abilityId, BS.abilityName),
    ];
    const result = new ArmsWarriorAnalyzer().analyze(
      makeContext({ events, fightStart: 0, fightEnd: 120_000 }),
    );
    expect(result.findings.some((f) => f.id.endsWith('_delay'))).toBe(false);
  });

  it('downgrades optional-cooldown zero-cast findings in Mythic+ but keeps Colossus Smash strict', () => {
    // 10-min dungeon run: no Avatar, no Bladestorm, no Colossus Smash.
    const events = [
      cast(10_000, ARMS_ABILITIES.mortalStrike.abilityId, 'Mortal Strike'),
      cast(20_000, ARMS_ABILITIES.overpower.abilityId, 'Overpower'),
    ];
    const result = new ArmsWarriorAnalyzer().analyze(
      makeContext({
        events,
        fightStart: 0,
        fightEnd: 600_000,
        zoneName: MPLUS_ZONE,
        fightDifficulty: 10,
      }),
    );
    for (const id of [
      'arms_warrior.avatar_delay',
      'arms_warrior.bladestorm_delay',
    ]) {
      const finding = result.findings.find((f) => f.id === id);
      expect(finding, id).toBeDefined();
      expect(finding?.severity).toBe('low');
      expect(finding?.description).toContain('天赋');
    }
    // Colossus Smash is mandatory in every Arms build — stays high.
    const cs = result.findings.find(
      (f) => f.id === 'arms_warrior.colossus_smash_delay',
    );
    expect(cs).toBeDefined();
    expect(cs?.severity).toBe('high');
    // Whole-dungeon GCD model stays gated off.
    expect(
      result.findings.some((f) => f.id === 'arms_warrior.gcd_idle'),
    ).toBe(false);
  });
});
