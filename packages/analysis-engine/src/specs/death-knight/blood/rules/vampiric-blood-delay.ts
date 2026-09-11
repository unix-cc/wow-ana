import { makeCooldownDelayRule } from '../../../helpers.js';
import { BLOOD_DEATH_KNIGHT_KNOWLEDGE } from '@wcl/spec-knowledge';
import { BLOOD_ABILITIES } from '../constants.js';

// Cooldown duration and confidence come from Spec Knowledge.
const vampiricBlood = BLOOD_DEATH_KNIGHT_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'vampiric_blood',
);

/**
 * Vampiric Blood is a *reactive* defensive: the slot model can only ever be
 * a reference, never an accusation (see the Blood DK knowledge header —
 * tank defensive usage is fight-driven).
 */
export const vampiricBloodDelayRule = makeCooldownDelayRule({
  id: 'blood_dk.vampiric_blood_delay',
  name: 'Vampiric Blood cooldown delay',
  description:
    'Vampiric Blood usage cadence (reference only): reactive defensive, fight-driven timing.',
  abilityId: BLOOD_ABILITIES.vampiricBlood.abilityId,
  abilityName: BLOOD_ABILITIES.vampiricBlood.abilityName,
  abilityDisplayName: vampiricBlood?.name,
  cooldownMs: vampiricBlood?.cooldownMs ?? 120_000,
  confidence: vampiricBlood?.confidence,
  defensive: true,
});
