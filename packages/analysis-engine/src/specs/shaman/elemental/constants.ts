/**
 * Elemental Shaman ability definitions.
 *
 * Ability IDs are game spell IDs as reported by WCL (verified against a real
 * log). Names are matched as a fallback because some reports expose names only.
 */
export interface ElementalAbilityRef {
  abilityId: number;
  abilityName: string;
}

export const ELEMENTAL_ABILITIES = {
  flameShock: { abilityId: 188389, abilityName: 'Flame Shock' },
  lavaBurst: { abilityId: 51505, abilityName: 'Lava Burst' },
  stormkeeper: { abilityId: 191634, abilityName: 'Stormkeeper' },
  fireElemental: { abilityId: 198067, abilityName: 'Fire Elemental' },
  lavaSurge: { abilityId: 77762, abilityName: 'Lava Surge' },
} as const satisfies Record<string, ElementalAbilityRef>;
