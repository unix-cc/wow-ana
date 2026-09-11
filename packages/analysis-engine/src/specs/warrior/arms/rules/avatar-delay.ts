import { makeCooldownDelayRule } from '../../../helpers.js';
import { ARMS_WARRIOR_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ARMS_ABILITIES } from '../constants.js';

const avatar = ARMS_WARRIOR_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'avatar',
);

/** Avatar should stay aligned with Colossus Smash windows. */
export const avatarDelayRule = makeCooldownDelayRule({
  id: 'arms_warrior.avatar_delay',
  name: 'Avatar cooldown delay',
  description:
    'Avatar should be used near its cooldown and aligned with Colossus Smash windows.',
  abilityId: ARMS_ABILITIES.avatar.abilityId,
  abilityName: ARMS_ABILITIES.avatar.abilityName,
  abilityDisplayName: avatar?.name,
  cooldownMs: avatar?.cooldownMs ?? 90_000,
  confidence: avatar?.confidence,
});
