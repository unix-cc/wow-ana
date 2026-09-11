import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { buffActiveMs, abilityCasts } from '../../../helpers.js';
import { BM_ABILITIES } from '../constants.js';
import { BEAST_MASTERY_KNOWLEDGE } from '@wcl/spec-knowledge';

const TARGET_UPTIME = 0.7;

// Phase F: confidence and the uptime target come from Spec Knowledge.
const beastCleaveBuff = BEAST_MASTERY_KNOWLEDGE.buffs.find(
  (entry) => entry.key === 'beast_cleave',
);
const KNOWLEDGE_UPTIME_TARGET = beastCleaveBuff?.expectedUptime ?? TARGET_UPTIME;

/**
 * Beast Cleave uptime rule. On multi-target fights Multi-Shot should keep
 * Beast Cleave active on the pet for cleave damage.
 */
export const beastCleaveUptimeRule: SpecRule = {
  id: 'bm_hunter.beast_cleave_uptime',
  name: 'Beast Cleave uptime',
  description:
    'In multi-target fights, Multi-Shot should keep Beast Cleave active.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const multiShotCasts = abilityCasts(
      events,
      player.id,
      BM_ABILITIES.multiShot.abilityId,
      BM_ABILITIES.multiShot.abilityName,
    );
    const { activeMs } = buffActiveMs(
      events,
      player.id,
      BM_ABILITIES.beastCleave.abilityId,
      BM_ABILITIES.beastCleave.abilityName,
      fight.startTime,
      fight.endTime,
    );

    // No Multi-Shot casts and no Beast Cleave events -> single-target fight,
    // rule does not apply.
    if (multiShotCasts.length === 0 && activeMs === 0) {
      return [];
    }

    const uptime = durationMs > 0 ? activeMs / durationMs : 0;
    if (uptime >= KNOWLEDGE_UPTIME_TARGET) return [];

    const confidence = beastCleaveBuff?.confidence;
    const shown = beastCleaveBuff?.name ?? BM_ABILITIES.beastCleave.abilityName;
    return [
      {
        id: 'bm_hunter.beast_cleave_uptime',
        category: 'target',
        severity: uptime < 0.4 ? 'high' : 'medium',
        title: `${shown} 覆盖率不足`,
        description: `多目标战斗中 ${shown} 覆盖率为 ${(uptime * 100).toFixed(1)}%（多重射击使用 ${multiShotCasts.length} 次）。`,
        durationMs: Math.max(0, durationMs - activeMs),
        ...(confidence !== undefined ? { confidence } : {}),
        expected: {
          buff: shown,
          targetUptime: KNOWLEDGE_UPTIME_TARGET,
        },
        actual: {
          uptime: Math.round(uptime * 1000) / 1000,
          multiShotCasts: multiShotCasts.length,
        },
        evidence: multiShotCasts.map((cast) => ({
          timestamp: cast.timestamp,
          fightId: fight.id,
          ability: shown,
          abilityId: cast.abilityId,
          note: 'Multi-Shot cast feeding Beast Cleave',
        })),
        recommendation: `多目标场合定期使用多重射击以维持 ${shown}，覆盖多数战斗时间。`,
      },
    ];
  },
};
