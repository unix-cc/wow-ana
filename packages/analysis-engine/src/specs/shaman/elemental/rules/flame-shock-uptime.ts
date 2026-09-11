import type { CombatEvent, Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { debuffActiveMs } from '../../../helpers.js';
import { isMythicPlusRun } from '../../../../fight-context.js';
import { ELEMENTAL_SHAMAN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ELEMENTAL_ABILITIES } from '../constants.js';

const TARGET_UPTIME = 0.8;
const LOW_UPTIME = 0.5;

/** Knowledge anchor for the expected-uptime expectation (debuffs.flame_shock). */
const flameShockKnowledge = ELEMENTAL_SHAMAN_KNOWLEDGE.debuffs.find(
  (entry) => entry.key === 'flame_shock',
);

/** Flame Shock DoT tick interval (periodic damage every ~3s). */
const FS_TICK_MS = 3_000;
/**
 * Gap between consecutive Flame Shock damage events above which the DoT is
 * considered off (target died / debuff expired / out of combat). Allows a
 * quick re-application without splitting the chain.
 */
const CHAIN_GAP_MS = 5_000;

/**
 * Sum the time during which Flame Shock dealt damage to *at least one* target,
 * approximated from the periodic-damage event chain.
 *
 * WCL's `Debuffs` dataType only exposes debuffs *on* the queried character
 * (verified against a live log: `Debuffs + sourceID=player` returns the player
 * as target), so player-applied DoT debuff events never reach the analyzer.
 * Every Flame Shock application also emits a damage event of the same ability,
 * so the tick chain is the truthful available signal: a chain break longer
 * than `CHAIN_GAP_MS` means no Flame Shock was ticking anywhere.
 */
function damageTickActiveMs(
  events: CombatEvent[],
  sourceId: number,
  abilityId: number,
  abilityName: string,
  fightStart: number,
  fightEnd: number,
): { activeMs: number; hits: number } {
  const hits = events
    .filter(
      (event) =>
        event.type === 'damage' &&
        event.sourceId === sourceId &&
        (event.abilityId === abilityId || event.abilityName === abilityName),
    )
    .map((event) => event.timestamp)
    .filter((timestamp) => timestamp >= fightStart && timestamp <= fightEnd)
    .sort((a, b) => a - b);

  if (hits.length === 0) return { activeMs: 0, hits: 0 };

  let activeMs = 0;
  let chainStart = hits[0] ?? 0;
  let prev = chainStart;
  for (const timestamp of hits.slice(1)) {
    if (timestamp - prev > CHAIN_GAP_MS) {
      const end = Math.min(fightEnd, prev + FS_TICK_MS);
      activeMs += Math.max(0, end - Math.max(fightStart, chainStart));
      chainStart = timestamp;
    }
    prev = timestamp;
  }
  const tailEnd = Math.min(fightEnd, prev + FS_TICK_MS);
  activeMs += Math.max(0, tailEnd - Math.max(fightStart, chainStart));
  return { activeMs, hits: hits.length };
}

/**
 * Flame Shock is the elemental's damage-over-time; it should be kept active
 * on targets for most of the fight.
 *
 * Scope: single-boss fights only. In a Mythic+ run Flame Shock is spread over
 * trash adds (multi-target), so the single-target uptime model does not hold —
 * reporting "0% uptime" there was a false alarm.
 */
export const flameShockUptimeRule: SpecRule = {
  id: 'elemental_shaman.flame_shock_uptime',
  name: 'Flame Shock uptime',
  description:
    'Flame Shock should be maintained on targets; long gaps mean lost damage-over-time.',
  evaluate(context): Finding[] {
    const { player, fight, report, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];
    if (isMythicPlusRun(report, fight)) return [];

    const abilityId = ELEMENTAL_ABILITIES.flameShock.abilityId;
    const abilityName = ELEMENTAL_ABILITIES.flameShock.abilityName;

    const debuff = debuffActiveMs(
      events,
      player.id,
      abilityId,
      abilityName,
      fight.startTime,
      fight.endTime,
    );
    const damage = damageTickActiveMs(
      events,
      player.id,
      abilityId,
      abilityName,
      fight.startTime,
      fight.endTime,
    );

    // No debuff signal (they never arrive from WCL today) and no Flame Shock
    // damage events at all: we cannot tell "not talented / target never
    // existed" from "dropped the DoT". Never emit a 0% scare on missing data.
    if (debuff.activeMs === 0 && damage.hits === 0) return [];

    const activeMs = debuff.activeMs > 0 ? debuff.activeMs : damage.activeMs;
    const uptime = durationMs > 0 ? activeMs / durationMs : 0;
    if (uptime >= TARGET_UPTIME) return [];

    const downtimeMs = Math.max(0, durationMs - activeMs);
    const confidence = flameShockKnowledge?.confidence;
    return [
      {
        id: 'elemental_shaman.flame_shock_uptime',
        category: 'rotation',
        severity: uptime < LOW_UPTIME ? 'high' : 'medium',
        title: '烈焰震击覆盖率不足',
        description: `烈焰震击覆盖率为 ${(uptime * 100).toFixed(1)}%，断档 ${Math.round(downtimeMs / 1000)}s。`,
        durationMs: downtimeMs,
        ...(confidence !== undefined ? { confidence } : {}),
        evidence: [
          { value: uptime, unit: 'ratio' },
          { value: activeMs, unit: 'ms', ability: abilityName, abilityId },
        ],
        expected: { ability: abilityName, uptimeTarget: TARGET_UPTIME },
        actual: { uptime: Math.round(uptime * 1000) / 1000 },
        recommendation: '保持烈焰震击在目标身上接近满覆盖，断档前及时补充。',
      },
    ];
  },
};
