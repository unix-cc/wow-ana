/**
 * Blood Death Knight ability definitions.
 *
 * Ability IDs are game spell IDs as reported by WCL (verified against a real
 * log). Names are matched as a fallback because some reports expose names only.
 */
export interface BloodAbilityRef {
  abilityId: number;
  abilityName: string;
}

export const BLOOD_ABILITIES = {
  deathStrike: { abilityId: 49998, abilityName: 'Death Strike' },
  marrowrend: { abilityId: 195182, abilityName: 'Marrowrend' },
  heartStrike: { abilityId: 206930, abilityName: 'Heart Strike' },
  bloodBoil: { abilityId: 50842, abilityName: 'Blood Boil' },
  vampiricBlood: { abilityId: 55233, abilityName: 'Vampiric Blood' },
  dancingRuneWeapon: { abilityId: 49028, abilityName: 'Dancing Rune Weapon' },
  boneShield: { abilityId: 195181, abilityName: 'Bone Shield' },
} as const satisfies Record<string, BloodAbilityRef>;
