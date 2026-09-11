import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { buffActiveMs } from '../../../helpers.js';
import { BLOOD_DEATH_KNIGHT_KNOWLEDGE } from '@wcl/spec-knowledge';
import { BLOOD_ABILITIES } from '../constants.js';

const TARGET_UPTIME = 0.85;
const LOW_UPTIME = 0.5;

/** Knowledge anchor for the expected-uptime expectation (buffs.bone_shield). */
const boneShieldKnowledge = BLOOD_DEATH_KNIGHT_KNOWLEDGE.buffs.find(
  (entry) => entry.key === 'bone_shield',
);

/**
 * Bone Shield is a core Blood defensive; Marrowrend must keep the stacks up.
 */
export const boneShieldUptimeRule: SpecRule = {
  id: 'blood_dk.bone_shield_uptime',
  name: 'Bone Shield uptime',
  description:
    'Bone Shield should be maintained with Marrowrend; long gaps reduce physical mitigation.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const { activeMs, refreshCount } = buffActiveMs(
      events,
      player.id,
      BLOOD_ABILITIES.boneShield.abilityId,
      BLOOD_ABILITIES.boneShield.abilityName,
      fight.startTime,
      fight.endTime,
    );
    const uptime = durationMs > 0 ? activeMs / durationMs : 0;
    if (uptime >= TARGET_UPTIME) return [];

    const downtimeMs = Math.max(0, durationMs - activeMs);
    const confidence = boneShieldKnowledge?.confidence;
    return [
      {
        id: 'blood_dk.bone_shield_uptime',
        category: 'buff',
        severity: uptime < LOW_UPTIME ? 'high' : 'medium',
        title: '白骨之盾覆盖率不足',
        description: `白骨之盾覆盖率为 ${(uptime * 100).toFixed(1)}%，断档 ${Math.round(downtimeMs / 1000)}s。骨髓分裂 ${refreshCount} 次。`,
        durationMs: downtimeMs,
        ...(confidence !== undefined ? { confidence } : {}),
        expected: {
          ability: boneShieldKnowledge?.name ?? '白骨之盾 (Bone Shield)',
          uptimeTarget: TARGET_UPTIME,
        },
        actual: { uptime: Math.round(uptime * 1000) / 1000 },
        evidence: [{ value: uptime, unit: 'ratio' }],
        recommendation: '用骨髓分裂维持白骨之盾叠层，断档前及时补充。',
      },
    ];
  },
};
