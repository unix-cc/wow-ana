/**
 * Beast Mastery Hunter ability definitions used by the spec analyzer.
 *
 * Ability IDs are the game spell IDs as reported by WCL. Names are matched as
 * a fallback because some WCL reports expose names only.
 */
export interface AbilityRef {
  abilityId: number;
  abilityName: string;
}

export const BM_ABILITIES = {
  killCommand: { abilityId: 34026, abilityName: 'Kill Command' },
  barbedShot: { abilityId: 217200, abilityName: 'Barbed Shot' },
  cobraShot: { abilityId: 193455, abilityName: 'Cobra Shot' },
  bestialWrath: { abilityId: 19574, abilityName: 'Bestial Wrath' },
  callOfTheWild: { abilityId: 359844, abilityName: 'Call of the Wild' },
  multiShot: { abilityId: 2643, abilityName: 'Multi-Shot' },
  beastCleave: { abilityId: 115939, abilityName: 'Beast Cleave' },
  barbedShotBuff: { abilityId: 246152, abilityName: 'Barbed Shot' },
} as const satisfies Record<string, AbilityRef>;

/** Cooldowns evaluated by the BM analyzer, in milliseconds. */
export const BM_COOLDOWNS: Array<{
  abilityId: number;
  abilityName: string;
  cooldownMs: number;
}> = [
  {
    abilityId: BM_ABILITIES.bestialWrath.abilityId,
    abilityName: BM_ABILITIES.bestialWrath.abilityName,
    cooldownMs: 90_000,
  },
  {
    abilityId: BM_ABILITIES.killCommand.abilityId,
    abilityName: BM_ABILITIES.killCommand.abilityName,
    cooldownMs: 6_000,
  },
];
