import type {
  CooldownDelaySample,
  CooldownFacts,
  CooldownUsageFact,
  Evidence,
} from '@wcl/domain';
import type {
  CooldownDefinition,
  CooldownFactsOptions,
  FactsInput,
} from './types.js';
import { castsBySource } from './timeline.js';

/**
 * Cooldown facts: how often a Spec-Knowledge-declared cooldown was actually
 * used versus the theoretical maximum, and how far each cast drifted from the
 * ideal cadence.
 *
 * The cooldown length itself comes from Spec Knowledge (`CooldownDefinition`),
 * never from WCL — WCL does not publish ability cooldowns.
 */
export function computeCooldownFacts(
  input: FactsInput,
  options: CooldownFactsOptions,
): CooldownFacts {
  const sourceId = options.sourceId ?? input.player.id;
  const durationMs = Math.max(0, input.fight.endTime - input.fight.startTime);
  const casts = castsBySource(input.events, sourceId);

  const usages = options.cooldowns.map((cooldown) =>
    measureUsage(cooldown, casts, input, durationMs),
  );

  return { type: 'cooldown', usages };
}

function measureUsage(
  cooldown: CooldownDefinition,
  casts: ReturnType<typeof castsBySource>,
  input: FactsInput,
  durationMs: number,
): CooldownUsageFact {
  const abilityCasts = casts.filter((cast) =>
    matchesAbility(
      cast,
      cooldown.abilityId,
      cooldown.abilityName,
    ),
  );

  const actualCasts = abilityCasts.length;
  const expectedCasts =
    cooldown.cooldownMs > 0
      ? Math.max(1, Math.floor(durationMs / cooldown.cooldownMs) + 1)
      : actualCasts;

  const delays = measureCadenceDelay(
    abilityCasts,
    input.fight.startTime,
    cooldown.cooldownMs,
  );

  const averageDelayMs =
    delays.length > 0
      ? Math.round(
          delays.reduce((sum, sample) => sum + sample.delayMs, 0) /
            delays.length,
        )
      : undefined;
  const maxDelayMs = delays.length
    ? Math.max(...delays.map((sample) => sample.delayMs))
    : undefined;

  const evidence: Evidence[] = delays
    .filter((sample) => sample.delayMs > 0)
    .map((sample) => ({
      fightId: input.fight.id,
      timestamp: sample.timestamp,
      ability: abilityCasts[0]?.abilityName ?? cooldown.abilityName,
      abilityId: abilityCasts[0]?.abilityId ?? cooldown.abilityId,
      value: sample.delayMs,
      unit: 'ms',
      note: `ideal ${sample.idealTimestamp}`,
    }));

  return {
    type: 'cooldown.usage',
    abilityId: abilityCasts[0]?.abilityId ?? cooldown.abilityId,
    abilityName: abilityCasts[0]?.abilityName ?? cooldown.abilityName,
    cooldownMs: cooldown.cooldownMs,
    actualCasts,
    expectedCasts,
    averageDelayMs,
    maxDelayMs,
    missedFinalCast:
      actualCasts > 0 && actualCasts < expectedCasts ? true : undefined,
    delays,
    evidence,
  };
}

function matchesAbility(
  cast: { abilityId?: number | undefined; abilityName?: string | undefined },
  abilityId?: number,
  abilityName?: string,
): boolean {
  if (abilityId !== undefined) return cast.abilityId === abilityId;
  if (abilityName !== undefined) return cast.abilityName === abilityName;
  return false;
}

/**
 * Measure how far each cast is from its ideal cadence: the cooldown fires at
 * startTime + n*cd. `idealTimestamp` uses the nearest slot so a cast that is
 * early still records a zero delay rather than a negative one.
 */
function measureCadenceDelay(
  casts: Array<{ timestamp: number }>,
  startTime: number,
  cooldownMs: number,
): CooldownDelaySample[] {
  if (casts.length < 2 || cooldownMs <= 0) return [];

  return casts.map((cast) => {
    const elapsed = cast.timestamp - startTime;
    const idealIndex = Math.round(elapsed / cooldownMs);
    const idealTimestamp = startTime + idealIndex * cooldownMs;
    return {
      timestamp: cast.timestamp,
      idealTimestamp,
      delayMs: Math.max(0, cast.timestamp - idealTimestamp),
    };
  });
}
