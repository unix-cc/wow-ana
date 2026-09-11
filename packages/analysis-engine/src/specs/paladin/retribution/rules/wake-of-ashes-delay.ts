import { makeCooldownDelayRule } from '../../../helpers.js';
import { RETRIBUTION_PALADIN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { RETRIBUTION_ABILITIES } from '../constants.js';

const wakeOfAshes = RETRIBUTION_PALADIN_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'wake_of_ashes',
);

/** Wake of Ashes (45s) generates 3 Holy Power — it should not sit idle. */
export const wakeOfAshesDelayRule = makeCooldownDelayRule({
  id: 'retribution_paladin.wake_of_ashes_delay',
  name: 'Wake of Ashes cooldown delay',
  description:
    'Wake of Ashes should be used near its 45-second cooldown; it is the primary Holy Power generator.',
  abilityId: RETRIBUTION_ABILITIES.wakeOfAshes.abilityId,
  abilityName: RETRIBUTION_ABILITIES.wakeOfAshes.abilityName,
  abilityDisplayName: wakeOfAshes?.name,
  cooldownMs: wakeOfAshes?.cooldownMs ?? 45_000,
  confidence: wakeOfAshes?.confidence,
});
