import { makeCooldownDelayRule } from '../../../helpers.js';
import { ELEMENTAL_SHAMAN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ELEMENTAL_ABILITIES } from '../constants.js';

// Cooldown duration and confidence come from Spec Knowledge — the rule itself
// carries no hardcoded numbers (same pattern as arcane-surge-delay).
const stormkeeper = ELEMENTAL_SHAMAN_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'stormkeeper',
);

/** Stormkeeper powers up the next bolts; it should be used near its 1-min CD. */
export const stormkeeperDelayRule = makeCooldownDelayRule({
  id: 'elemental_shaman.stormkeeper_delay',
  name: 'Stormkeeper cooldown delay',
  description:
    'Stormkeeper should be used near its 1-minute cooldown; delays waste burst windows.',
  abilityId: ELEMENTAL_ABILITIES.stormkeeper.abilityId,
  abilityName: ELEMENTAL_ABILITIES.stormkeeper.abilityName,
  abilityDisplayName: stormkeeper?.name,
  cooldownMs: stormkeeper?.cooldownMs ?? 60_000,
  confidence: stormkeeper?.confidence,
});
