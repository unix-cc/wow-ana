import { makeCooldownDelayRule } from '../../../helpers.js';
import { RETRIBUTION_PALADIN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { RETRIBUTION_ABILITIES } from '../constants.js';

const executionSentence = RETRIBUTION_PALADIN_KNOWLEDGE.cooldowns.find(
  (entry) => entry.key === 'execution_sentence',
);

/** Execution Sentence (60s) should be fired on cooldown to bank its payout. */
export const executionSentenceDelayRule = makeCooldownDelayRule({
  id: 'retribution_paladin.execution_sentence_delay',
  name: 'Execution Sentence cooldown delay',
  description:
    'Execution Sentence should be used near its 1-minute cooldown; delays waste its damage payout.',
  abilityId: RETRIBUTION_ABILITIES.executionSentence.abilityId,
  abilityName: RETRIBUTION_ABILITIES.executionSentence.abilityName,
  abilityDisplayName: executionSentence?.name,
  cooldownMs: executionSentence?.cooldownMs ?? 60_000,
  confidence: executionSentence?.confidence,
});
