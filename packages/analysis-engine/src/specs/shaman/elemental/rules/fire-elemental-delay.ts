import { makeCooldownDelayRule } from '../../../helpers.js';
import { ELEMENTAL_SHAMAN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ELEMENTAL_ABILITIES } from '../constants.js';

// Cooldown duration and confidence come from Spec Knowledge — the rule itself
// carries no hardcoded numbers (same pattern as arcane-surge-delay).
const fireElemental = ELEMENTAL_SHAMAN_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'fire_elemental',
);

/** Fire Elemental is the shaman's big summon; use it near its 2-min CD. */
export const fireElementalDelayRule = makeCooldownDelayRule({
  id: 'elemental_shaman.fire_elemental_delay',
  name: 'Fire Elemental cooldown delay',
  description:
    'Fire Elemental should be summoned near its 2-minute cooldown; delays waste a large damage window.',
  abilityId: ELEMENTAL_ABILITIES.fireElemental.abilityId,
  abilityName: ELEMENTAL_ABILITIES.fireElemental.abilityName,
  abilityDisplayName: fireElemental?.name,
  cooldownMs: fireElemental?.cooldownMs ?? 120_000,
  confidence: fireElemental?.confidence,
});
