/**
 * Arms Warrior ability definitions.
 *
 * Ability IDs are game spell IDs as reported by WCL (verified against
 * wowdb/wowhead spell pages and the 12.1 guide rotations — see
 * @wcl/spec-knowledge warrior-arms). Names are matched as a fallback
 * because some reports expose names only. Demolish / Heroic Strike ids
 * are not verified yet and are intentionally absent.
 */
export interface ArmsAbilityRef {
  abilityId: number;
  abilityName: string;
}

export const ARMS_ABILITIES = {
  colossusSmash: { abilityId: 167105, abilityName: 'Colossus Smash' },
  avatar: { abilityId: 107574, abilityName: 'Avatar' },
  bladestorm: { abilityId: 227847, abilityName: 'Bladestorm' },
  ravager: { abilityId: 152277, abilityName: 'Ravager' },
  mortalStrike: { abilityId: 12294, abilityName: 'Mortal Strike' },
  overpower: { abilityId: 7384, abilityName: 'Overpower' },
  execute: { abilityId: 163201, abilityName: 'Execute' },
  slam: { abilityId: 1464, abilityName: 'Slam' },
  rend: { abilityId: 772, abilityName: 'Rend' },
  cleave: { abilityId: 845, abilityName: 'Cleave' },
  sweepingStrikes: { abilityId: 260708, abilityName: 'Sweeping Strikes' },
} as const satisfies Record<string, ArmsAbilityRef>;
