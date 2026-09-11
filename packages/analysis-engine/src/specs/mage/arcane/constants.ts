/**
 * Arcane Mage ability definitions.
 *
 * Ability IDs are game spell IDs as reported by WCL (verified against a real
 * log). Names are matched as a fallback because some reports expose names only.
 *
 * Note: Arcane Power (12042) was reworked into Arcane Surge (365350) in
 * Dragonflight (10.0) and fully removed by 10.1.5 — current logs never contain
 * 12042, so only Arcane Surge is tracked here.
 */
export interface ArcaneAbilityRef {
  abilityId: number;
  abilityName: string;
}

export const ARCANE_ABILITIES = {
  arcaneBlast: { abilityId: 30451, abilityName: 'Arcane Blast' },
  arcaneMissiles: { abilityId: 5143, abilityName: 'Arcane Missiles' },
  arcaneBarrage: { abilityId: 44425, abilityName: 'Arcane Barrage' },
  arcaneSurge: { abilityId: 365350, abilityName: 'Arcane Surge' },
  clearcasting: { abilityId: 263725, abilityName: 'Clearcasting' },
} as const satisfies Record<string, ArcaneAbilityRef>;
