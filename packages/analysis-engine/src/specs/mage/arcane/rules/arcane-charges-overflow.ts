import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { abilityCasts } from '../../../helpers.js';
import { ARCANE_ABILITIES } from '../constants.js';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';

const MIN_BLASTS = 20;
const MIN_BARRAGE_RATIO = 0.8;

// Phase F: confidence comes from Spec Knowledge (abilities.arcane_barrage).
const barrageAbility = ARCANE_MAGE_KNOWLEDGE.abilities.find(
  (entry) => entry.key === 'arcane_barrage',
);

/**
 * Arcane charges cap at four stacks; Arcane Barrage is the spender. If the
 * player builds far more charges than they spend, charges are being wasted to
 * the cap.
 */
export const arcaneChargesOverflowRule: SpecRule = {
  id: 'arcane_mage.arcane_charges_overflow',
  name: 'Arcane charges spent',
  description:
    'Arcane Blast builds charges up to 4; Arcane Barrage should spend them. Sustained over-build wastes charges to the cap.',
  evaluate(context): Finding[] {
    const { player, fight, events } = context;
    const durationMs = Math.max(0, fight.endTime - fight.startTime);
    if (durationMs < 30_000) return [];

    const blasts = abilityCasts(
      events,
      player.id,
      ARCANE_ABILITIES.arcaneBlast.abilityId,
      ARCANE_ABILITIES.arcaneBlast.abilityName,
    ).length;
    if (blasts < MIN_BLASTS) return [];

    const barrageCasts = abilityCasts(
      events,
      player.id,
      ARCANE_ABILITIES.arcaneBarrage.abilityId,
      ARCANE_ABILITIES.arcaneBarrage.abilityName,
    );
    const barrages = barrageCasts.length;

    // Each 4 blasts produce a full charge stack worth spending with Barrage.
    const expectedBarrage = Math.floor(blasts / 4);
    const ratio = barrages / expectedBarrage;
    if (expectedBarrage < 5 || ratio >= MIN_BARRAGE_RATIO) return [];

    const missing = Math.max(0, expectedBarrage - barrages);
    const confidence = barrageAbility?.confidence;
    const shown =
      barrageAbility?.name ?? ARCANE_ABILITIES.arcaneBarrage.abilityName;
    return [
      {
        id: 'arcane_mage.arcane_charges_overflow',
        category: 'rotation',
        severity: ratio < 0.5 ? 'high' : 'medium',
        title: '奥术充能未及时用奥术弹幕释放',
        description: `奥术冲击 ${blasts} 次（理论需 ${expectedBarrage} 次弹幕释放），实际仅用奥术弹幕 ${barrages} 次，少释放约 ${missing} 次（${(ratio * 100).toFixed(0)}%）。`,
        ...(confidence !== undefined ? { confidence } : {}),
        expected: {
          ability: shown,
          expectedCasts: expectedBarrage,
        },
        actual: { blasts, barrages, missing },
        evidence: barrageCasts.map((cast) => ({
          timestamp: cast.timestamp,
          fightId: fight.id,
          ability: cast.abilityName,
          abilityId: cast.abilityId,
          note: 'Arcane Barrage spend',
        })),
        recommendation: '充能叠满前用奥术弹幕释放，避免充能达到上限后浪费。',
      },
    ];
  },
};
