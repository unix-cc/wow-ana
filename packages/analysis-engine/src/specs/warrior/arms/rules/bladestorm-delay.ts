import { makeCooldownDelayRule } from '../../../helpers.js';
import { ARMS_WARRIOR_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ARMS_ABILITIES } from '../constants.js';

const bladestorm = ARMS_WARRIOR_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'bladestorm',
);

/** Bladestorm is the Slayer signature cooldown — prefer it inside CS windows. */
export const bladestormDelayRule = makeCooldownDelayRule({
  id: 'arms_warrior.bladestorm_delay',
  name: 'Bladestorm cooldown delay',
  description:
    'Bladestorm should be used near its cooldown, ideally during a Colossus Smash debuff window.',
  abilityId: ARMS_ABILITIES.bladestorm.abilityId,
  abilityName: ARMS_ABILITIES.bladestorm.abilityName,
  abilityDisplayName: bladestorm?.name,
  cooldownMs: bladestorm?.cooldownMs ?? 90_000,
  confidence: bladestorm?.confidence,
});
