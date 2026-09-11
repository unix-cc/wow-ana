import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { buffActiveMs } from '../../../helpers.js';
import { BM_ABILITIES } from '../constants.js';
import { BEAST_MASTERY_KNOWLEDGE } from '@wcl/spec-knowledge';

const TARGET_UPTIME = 0.8;
const LOW_UPTIME = 0.5;

// Phase F: confidence and the uptime target come from Spec Knowledge.
const barbedShotBuff = BEAST_MASTERY_KNOWLEDGE.buffs.find(
  (entry) => entry.key === 'barbed_shot',
);
const KNOWLEDGE_UPTIME_TARGET = barbedShotBuff?.expectedUptime ?? TARGET_UPTIME;

/**
 * Barbed Shot buff uptime rule. Keeping Barbed Shot's buff up drives pet
 * attack speed and is core to the Beast Mastery rotation.
 */
export const barbedShotUptimeRule: SpecRule = {
  id: 'bm_hunter.barbed_shot_uptime',
  name: 'Barbed Shot buff uptime',
  description:
    'The Barbed Shot buff should be maintained for most of the fight; long gaps indicate missed casts.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const { activeMs, refreshCount } = buffActiveMs(
      events,
      player.id,
      BM_ABILITIES.barbedShotBuff.abilityId,
      BM_ABILITIES.barbedShotBuff.abilityName,
      fight.startTime,
      fight.endTime,
    );
    const uptime = durationMs > 0 ? activeMs / durationMs : 0;
    if (uptime >= KNOWLEDGE_UPTIME_TARGET) return [];

    const downtimeMs = Math.max(0, durationMs - activeMs);
    const confidence = barbedShotBuff?.confidence;
    const shown = barbedShotBuff?.name ?? BM_ABILITIES.barbedShotBuff.abilityName;
    return [
      {
        id: 'bm_hunter.barbed_shot_uptime',
        category: 'buff',
        severity: uptime < LOW_UPTIME ? 'high' : 'medium',
        title: `${shown} buff 覆盖率不足`,
        description: `${shown} buff 覆盖率为 ${(uptime * 100).toFixed(1)}%，断档 ${Math.round(downtimeMs / 1000)}s。刷新次数 ${refreshCount}。`,
        durationMs: downtimeMs,
        ...(confidence !== undefined ? { confidence } : {}),
        expected: {
          buff: shown,
          targetUptime: KNOWLEDGE_UPTIME_TARGET,
        },
        actual: {
          uptime: Math.round(uptime * 1000) / 1000,
          downtimeMs,
          refreshCount,
        },
        evidence: [
          {
            fightId: fight.id,
            value: uptime,
            unit: 'ratio',
            note: 'buff uptime vs target',
          },
        ],
        recommendation:
          '保持 Barbed Shot buff 接近满覆盖，在 buff 快结束时及时刷新，避免叠层断档。',
      },
    ];
  },
};
