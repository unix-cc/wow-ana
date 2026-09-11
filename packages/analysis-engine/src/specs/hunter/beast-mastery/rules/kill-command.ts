import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { abilityCasts } from '../../../helpers.js';
import { BM_ABILITIES } from '../constants.js';
import { BEAST_MASTERY_KNOWLEDGE } from '@wcl/spec-knowledge';

const KILL_COMMAND_CD_MS = 6_000;
const MIN_EXPECTED_RATIO = 0.8;

// Phase F: confidence now comes from Spec Knowledge, not a hardcoded constant.
const killCommandAbility = BEAST_MASTERY_KNOWLEDGE.abilities.find(
  (entry) => entry.key === 'kill_command',
);

/**
 * Kill Command usage rule: compares actual casts against the theoretical
 * maximum allowed by the fight duration and the 6s cooldown.
 */
export const killCommandUsageRule: SpecRule = {
  id: 'bm_hunter.kill_command_usage',
  name: 'Kill Command usage',
  description:
    'Kill Command should be used on cooldown; under-usage costs damage.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const casts = abilityCasts(
      events,
      player.id,
      BM_ABILITIES.killCommand.abilityId,
      BM_ABILITIES.killCommand.abilityName,
    );
    const actual = casts.length;
    // First cast at t=0 then every 6s
    const expected = Math.floor(durationMs / KILL_COMMAND_CD_MS) + 1;
    const ratio = expected > 0 ? actual / expected : 1;

    if (ratio >= MIN_EXPECTED_RATIO || expected === 0) {
      return [];
    }

    const missed = Math.max(0, expected - actual);
    const confidence = killCommandAbility?.confidence;
    // Player-facing name from Spec Knowledge (official zh-CN); the constant
    // stays English because it is the event-matching key.
    const shown = killCommandAbility?.name ?? BM_ABILITIES.killCommand.abilityName;
    return [
      {
        id: 'bm_hunter.kill_command_usage',
        category: 'rotation',
        severity: missed >= 5 ? 'high' : 'medium',
        title: `${shown} 使用不足`,
        description: `战斗时长 ${Math.round(durationMs / 1000)}s，${shown} 理论可用 ${expected} 次，实际仅使用 ${actual} 次，缺失 ${missed} 次（${Math.round(ratio * 100)}%）。`,
        ...(confidence !== undefined ? { confidence } : {}),
        expected: {
          ability: shown,
          cooldownMs: KILL_COMMAND_CD_MS,
          expectedCasts: expected,
          ratioTarget: MIN_EXPECTED_RATIO,
        },
        actual: { casts: actual, missed, ratio: Math.round(ratio * 1000) / 1000 },
        evidence: casts.map((cast) => {
          const elapsed = cast.timestamp - fight.startTime;
          const slot = Math.round(elapsed / KILL_COMMAND_CD_MS);
          return {
            timestamp: cast.timestamp,
            expectedAt: fight.startTime + slot * KILL_COMMAND_CD_MS,
            fightId: fight.id,
            ability: shown,
            abilityId: cast.abilityId,
            note: 'actual cast vs expected 6s cadence',
          };
        }),
        recommendation: `尽量按 6 秒冷却使用 ${shown}，避免让该技能冷却溢出。`,
      },
    ];
  },
};
