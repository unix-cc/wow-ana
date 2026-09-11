import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { abilityCasts } from '../../../helpers.js';
import { ARCANE_ABILITIES } from '../constants.js';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';

const MIN_PROCS = 10;
const MISSILES_RATIO = 0.6;
const MAX_EVIDENCE_POINTS = 12;

// Phase F: confidence comes from Spec Knowledge (buffs.clearcasting).
const clearcastingBuff = ARCANE_MAGE_KNOWLEDGE.buffs.find(
  (entry) => entry.key === 'clearcasting',
);

/**
 * Clearcasting procs should be consumed with Arcane Missiles. Many procs with
 * few Missiles casts means free casts were wasted.
 */
export const clearcastingWasteRule: SpecRule = {
  id: 'arcane_mage.clearcasting_waste',
  name: 'Clearcasting proc usage',
  description:
    'Clearcasting procs should be spent on Arcane Missiles; a large surplus means free casts were wasted.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const procEvents = events.filter(
      (event) =>
        event.sourceId === player.id &&
        event.rawType === 'applybuff' &&
        (event.abilityId === ARCANE_ABILITIES.clearcasting.abilityId ||
          event.abilityName === ARCANE_ABILITIES.clearcasting.abilityName),
    );
    const procs = procEvents.length;
    if (procs < MIN_PROCS) return [];

    const missiles = abilityCasts(
      events,
      player.id,
      ARCANE_ABILITIES.arcaneMissiles.abilityId,
      ARCANE_ABILITIES.arcaneMissiles.abilityName,
    ).length;

    const ratio = missiles / procs;
    if (ratio >= MISSILES_RATIO) return [];

    const wasted = procs - missiles;
    // Traceability cap: a handful of evenly spaced proc timestamps is enough.
    const step = Math.max(1, Math.floor(procs / MAX_EVIDENCE_POINTS));
    const evidenceProcs = procEvents.filter(
      (_event, index) => index % step === 0,
    );
    const confidence = clearcastingBuff?.confidence;
    // Display name from knowledge (official zh-CN) — the constant stays the
    // English matching key.
    const shown =
      ARCANE_MAGE_KNOWLEDGE.abilities.find((entry) => entry.key === 'arcane_missiles')
        ?.name ?? ARCANE_ABILITIES.arcaneMissiles.abilityName;
    return [
      {
        id: 'arcane_mage.clearcasting_waste',
        category: 'rotation',
        severity: wasted >= 15 ? 'high' : 'medium',
        title: '奥术飞弹使用不足，浪费清晰预兆',
        description: `战斗中触发 ${procs} 次清晰预兆，仅施放 ${missiles} 次奥术飞弹，浪费约 ${wasted} 次免费飞弹（消耗率 ${(ratio * 100).toFixed(0)}%）。`,
        ...(confidence !== undefined ? { confidence } : {}),
        expected: {
          ability: shown,
          consumePerProc: 1,
          minConsumeRatio: MISSILES_RATIO,
        },
        actual: {
          procs,
          missiles,
          wasted,
          consumeRatio: Math.round(ratio * 1000) / 1000,
        },
        evidence: [
          ...evidenceProcs.map((event) => ({
            timestamp: event.timestamp,
            fightId: fight.id,
            ability: event.abilityName,
            abilityId: event.abilityId,
            note: 'clearcasting proc not consumed',
          })),
          {
            fightId: fight.id,
            value: wasted,
            unit: '次',
            note: 'estimated wasted procs',
          },
        ],
        recommendation: '清晰预兆触发后尽快使用奥术飞弹，避免免费技能溢出。',
      },
    ];
  },
};
