/**
 * Group-role classification (tank / healer / damage) by spec name.
 *
 * This is static game-structure knowledge (which specialisation fills which
 * role), not numeric balance knowledge — it intentionally lives outside the
 * Spec Knowledge registry (which models abilities / buffs / rules). Sources:
 * the game's role assignments, stable since Legion.
 */
const TANK_SPECS = new Set<string>([
  'Blood',
  'Brewmaster',
  'Guardian',
  'Protection',
  'Protection Paladin',
  'Vengeance',
]);

const HEALER_SPECS = new Set<string>([
  'Discipline',
  'Holy',
  'Holy Paladin',
  'Mistweaver',
  'Preservation',
  'Restoration',
  'Restoration Druid',
]);

export function isTankSpec(specName: string | undefined): boolean {
  if (!specName) return false;
  return TANK_SPECS.has(specName);
}

export function isHealerSpec(specName: string | undefined): boolean {
  if (!specName) return false;
  return HEALER_SPECS.has(specName);
}

/** Group a player's contribution to a wipe: tank / healer / dps / unknown. */
export function roleOfSpec(specName: string | undefined): 'tank' | 'healer' | 'dps' | 'unknown' {
  if (isTankSpec(specName)) return 'tank';
  if (isHealerSpec(specName)) return 'healer';
  return specName ? 'dps' : 'unknown';
}
