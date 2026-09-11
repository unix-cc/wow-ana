import { makeCooldownDelayRule } from '../../../helpers.js';
import { RETRIBUTION_PALADIN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { RETRIBUTION_ABILITIES } from '../constants.js';

// Cooldown duration and confidence come from Spec Knowledge — the rule itself
// carries no hardcoded numbers (same pattern as stormkeeper-delay).
const avengingWrath = RETRIBUTION_PALADIN_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'avenging_wrath',
);

/** Avenging Wrath is the main burst window; use it near its 2-min CD. */
export const avengingWrathDelayRule = makeCooldownDelayRule({
  id: 'retribution_paladin.avenging_wrath_delay',
  name: 'Avenging Wrath cooldown delay',
  description:
    'Avenging Wrath should be used near its 2-minute cooldown; delays waste burst windows.',
  abilityId: RETRIBUTION_ABILITIES.avengingWrath.abilityId,
  abilityName: RETRIBUTION_ABILITIES.avengingWrath.abilityName,
  abilityDisplayName: avengingWrath?.name,
  cooldownMs: avengingWrath?.cooldownMs ?? 120_000,
  confidence: avengingWrath?.confidence,
});
