/**
 * Retribution Paladin ability definitions.
 *
 * Ability IDs are game spell IDs as reported by WCL (verified against
 * Blizzard spell dumps and the 12.1 guide rotations — see
 * @wcl/spec-knowledge paladin-retribution). Names are matched as a
 * fallback because some reports expose names only.
 */
export interface RetributionAbilityRef {
  abilityId: number;
  abilityName: string;
}

export const RETRIBUTION_ABILITIES = {
  avengingWrath: { abilityId: 31884, abilityName: 'Avenging Wrath' },
  executionSentence: { abilityId: 343527, abilityName: 'Execution Sentence' },
  wakeOfAshes: { abilityId: 255937, abilityName: 'Wake of Ashes' },
  bladeOfJustice: { abilityId: 184575, abilityName: 'Blade of Justice' },
  finalVerdict: { abilityId: 383328, abilityName: 'Final Verdict' },
  divineStorm: { abilityId: 53385, abilityName: 'Divine Storm' },
} as const satisfies Record<string, RetributionAbilityRef>;
