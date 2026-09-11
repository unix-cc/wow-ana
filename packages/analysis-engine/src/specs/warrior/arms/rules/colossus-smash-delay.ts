import { makeCooldownDelayRule } from '../../../helpers.js';
import { ARMS_WARRIOR_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ARMS_ABILITIES } from '../constants.js';

const colossusSmash = ARMS_WARRIOR_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'colossus_smash',
);

/**
 * Colossus Smash opens the main damage window. Tactician resets and Anger
 * Management reduction make real intervals shorter than 45s — early casts
 * are never penalized, only sustained delays are.
 */
export const colossusSmashDelayRule = makeCooldownDelayRule({
  id: 'arms_warrior.colossus_smash_delay',
  name: 'Colossus Smash cooldown delay',
  description:
    'Colossus Smash should be used near its cooldown; delays desync the burst window and every other cooldown with it.',
  abilityId: ARMS_ABILITIES.colossusSmash.abilityId,
  abilityName: ARMS_ABILITIES.colossusSmash.abilityName,
  abilityDisplayName: colossusSmash?.name,
  cooldownMs: colossusSmash?.cooldownMs ?? 45_000,
  confidence: colossusSmash?.confidence,
});
