import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { abilityCasts } from '../../../helpers.js';
import { ELEMENTAL_SHAMAN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { ELEMENTAL_ABILITIES } from '../constants.js';

const MIN_PROCS = 10;
const LAVA_BURST_RATIO = 0.6;

/** Knowledge anchor for the "consume procs promptly" expectation. */
const lavaSurgeKnowledge = ELEMENTAL_SHAMAN_KNOWLEDGE.buffs.find(
  (entry) => entry.key === 'lava_surge',
);

/**
 * Lava Surge procs make Lava Burst instant. Many procs with few Lava Burst
 * casts means free instant casts were wasted.
 */
export const lavaSurgeWasteRule: SpecRule = {
  id: 'elemental_shaman.lava_surge_waste',
  name: 'Lava Surge proc usage',
  description:
    'Lava Surge procs should be spent on Lava Burst; a large surplus means free instant casts were wasted.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const procs = events.filter(
      (event) =>
        event.sourceId === player.id &&
        event.rawType === 'applybuff' &&
        (event.abilityId === ELEMENTAL_ABILITIES.lavaSurge.abilityId ||
          event.abilityName === ELEMENTAL_ABILITIES.lavaSurge.abilityName),
    ).length;
    if (procs < MIN_PROCS) return [];

    const lavaBursts = abilityCasts(
      events,
      player.id,
      ELEMENTAL_ABILITIES.lavaBurst.abilityId,
      ELEMENTAL_ABILITIES.lavaBurst.abilityName,
    ).length;

    const ratio = lavaBursts / procs;
    if (ratio >= LAVA_BURST_RATIO) return [];

    const wasted = procs - lavaBursts;
    const confidence = lavaSurgeKnowledge?.confidence;
    return [
      {
        id: 'elemental_shaman.lava_surge_waste',
        category: 'rotation',
        severity: wasted >= 15 ? 'high' : 'medium',
        title: '熔岩爆裂使用不足，浪费熔岩涌动',
        description: `战斗中触发 ${procs} 次熔岩涌动，仅施放 ${lavaBursts} 次熔岩爆裂，浪费约 ${wasted} 次（消耗率 ${(ratio * 100).toFixed(0)}%）。`,
        ...(confidence !== undefined ? { confidence } : {}),
        expected: { consumeRatioTarget: LAVA_BURST_RATIO },
        actual: { consumeRatio: Math.round(ratio * 1000) / 1000, wastedProcs: wasted },
        evidence: [{ value: wasted, unit: '次' }],
        recommendation: '熔岩涌动触发后尽快使用熔岩爆裂，避免免费技能溢出。',
      },
    ];
  },
};
