import { makeCooldownDelayRule } from '../../../helpers.js';
import { BM_ABILITIES } from '../constants.js';
import { BEAST_MASTERY_KNOWLEDGE } from '@wcl/spec-knowledge';

// Phase F: this rule now shares the cooldown-delay factory with the other
// specs; confidence and the 90s cooldown come from Spec Knowledge.
const bestialWrath = BEAST_MASTERY_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'bestial_wrath',
);

/** Bestial Wrath cooldown-delay rule. */
export const cooldownDelayRule = makeCooldownDelayRule({
  id: 'bm_hunter.cooldown_delay',
  name: 'Bestial Wrath cooldown delay',
  description:
    'Bestial Wrath should be used near its 90s cooldown; delays waste burst opportunities.',
  abilityId: BM_ABILITIES.bestialWrath.abilityId,
  abilityName: BM_ABILITIES.bestialWrath.abilityName,
  abilityDisplayName: bestialWrath?.name,
  cooldownMs: bestialWrath?.cooldownMs ?? 90_000,
  confidence: bestialWrath?.confidence,
});
