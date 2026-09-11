import { makeCooldownDelayRule } from '../../../helpers.js';
import { ARCANE_ABILITIES } from '../constants.js';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';

// Knowledge single-source: cooldown + confidence come from spec-knowledge's
// `arcane_surge` entry. Arcane Power (12042) was reworked into Arcane Surge
// (365350) in Dragonflight and fully removed by 10.1.5 — it must never be
// referenced against current logs again.
const arcaneSurge = ARCANE_MAGE_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'arcane_surge',
);

// Safety fallback mirroring spec-knowledge mage-arcane.ts (kept in sync);
// the entry above is guaranteed by packages/spec-knowledge tests.
const SURGE_COOLDOWN_MS = 90_000;

/** Arcane Surge (涌动) is Arcane mage's primary burst; use it near its CD. */
export const arcaneSurgeDelayRule = makeCooldownDelayRule({
  id: 'arcane_mage.arcane_surge_delay',
  name: 'Arcane Surge cooldown delay',
  description:
    'Arcane Surge is the mage primary burst and mana tool; delays push the whole burst window back.',
  abilityId: ARCANE_ABILITIES.arcaneSurge.abilityId,
  abilityName: ARCANE_ABILITIES.arcaneSurge.abilityName,
  abilityDisplayName: arcaneSurge?.name,
  cooldownMs: arcaneSurge?.cooldownMs ?? SURGE_COOLDOWN_MS,
  confidence: arcaneSurge?.confidence,
});
