import type { FactSet } from '@wcl/domain';
import type { CombatFactsOptions, FactsInput } from './types.js';
import { computeCastFacts } from './casts.js';
import { computeGcdFacts } from './gcd.js';
import { computeCooldownFacts } from './cooldowns.js';
import { computeBuffFacts } from './buffs.js';
import { computeResourceFacts } from './resources.js';
import { computeDamageFacts } from './damage.js';
import { computeDeathFacts } from './deaths.js';
import { computeTargetFacts } from './targets.js';
import { computeDispelFacts } from './dispels.js';
import { computeInterruptFacts } from './interrupts.js';

/**
 * Build the fact set for one player in one fight.
 *
 * Only the requested groups are computed, so a caller can follow
 * "Analysis Requirement → Data Requirement" instead of always paying for
 * every computation.
 */
export function buildCombatFacts(
  input: FactsInput,
  options?: CombatFactsOptions,
): FactSet {
  const sourceId = options?.sourceId;
  const targetId = options?.targetId;

  const set: FactSet = {
    fight: {
      id: input.fight.id,
      startTime: input.fight.startTime,
      endTime: input.fight.endTime,
    },
    player: { id: input.player.id, name: input.player.name },
    cast: computeCastFacts(input, { sourceId }),
    gcd: computeGcdFacts(input, { sourceId, gcdMs: options?.gcdMs }),
    buff: computeBuffFacts(input, { targetId }),
    resource: computeResourceFacts(input, { sourceId }),
  };

  if (options?.cooldowns && options.cooldowns.length > 0) {
    set.cooldown = computeCooldownFacts(input, {
      sourceId,
      cooldowns: options.cooldowns,
    });
  }

  if (options?.damage) {
    set.damage = computeDamageFacts(input, { sourceId });
  }
  if (options?.death) {
    set.death = computeDeathFacts(input, {
      targetId,
      preDeathWindowMs: options.preDeathWindowMs,
    });
  }
  if (options?.target) {
    set.target = computeTargetFacts(input, { sourceId });
  }
  if (options?.dispel) {
    set.dispel = computeDispelFacts(input, { sourceId });
  }
  if (options?.interrupt) {
    set.interrupt = computeInterruptFacts(input, { sourceId });
  }

  return set;
}
