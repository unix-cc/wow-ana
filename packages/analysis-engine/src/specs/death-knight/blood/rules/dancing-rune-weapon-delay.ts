import { makeCooldownDelayRule } from '../../../helpers.js';
import { BLOOD_DEATH_KNIGHT_KNOWLEDGE } from '@wcl/spec-knowledge';
import { BLOOD_ABILITIES } from '../constants.js';

// Cooldown duration and confidence come from Spec Knowledge.
const dancingRuneWeapon = BLOOD_DEATH_KNIGHT_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'dancing_rune_weapon',
);

/**
 * Dancing Rune Weapon is dual-nature (defensive + offensive), but its timing
 * still follows danger windows more than cooldown slots — reference only.
 */
export const dancingRuneWeaponDelayRule = makeCooldownDelayRule({
  id: 'blood_dk.dancing_rune_weapon_delay',
  name: 'Dancing Rune Weapon cooldown delay',
  description:
    'Dancing Rune Weapon usage cadence (reference only): dual defensive/offensive, fight-driven timing.',
  abilityId: BLOOD_ABILITIES.dancingRuneWeapon.abilityId,
  abilityName: BLOOD_ABILITIES.dancingRuneWeapon.abilityName,
  abilityDisplayName: dancingRuneWeapon?.name,
  cooldownMs: dancingRuneWeapon?.cooldownMs ?? 240_000,
  confidence: dancingRuneWeapon?.confidence,
  defensive: true,
});
