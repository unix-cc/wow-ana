import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Blood Death Knight knowledge.
 *
 * Ability IDs and cooldowns were verified against real WCL logs — lifted
 * from the pre-refactor `specs/death-knight/blood/constants.ts` and the
 * vampiric-blood / dancing-rune-weapon delay rules. Defensive usage
 * (Vampiric Blood / DRW) stays deliberately out of the priority list:
 * tank defensive timing is fight-driven, and encoding "use defensives on
 * cooldown" would produce exactly the false-positive class Phase M/N
 * removed elsewhere. Since v1.1.0 the list carries the one defensive
 * anchor that IS rotation-driven and observable: keeping Bone Shield
 * stacks from falling off.
 */

const LOG_VERIFIED: KnowledgeSource = {
  type: 'manual',
  reference:
    'verified against real WCL logs, see packages/analysis-engine/src/specs/death-knight/blood/constants.ts (ability ids) and the pre-refactor delay rules (cooldowns)',
};

const EXISTING_RULES: KnowledgeSource = {
  type: 'manual',
  reference:
    'thresholds extracted from the pre-refactor blood rules (bone-shield-uptime)',
};

const COMMUNITY: KnowledgeSource = {
  type: 'community',
  reference: 'Blood Death Knight rotation guides, Midnight 12.1 (needs verification)',
};

export const BLOOD_DEATH_KNIGHT_KNOWLEDGE: SpecKnowledge = {
  specId: 250,
  specName: 'Blood',
  className: 'Death Knight',
  patch: 'current',
  knowledgeVersion: '1.1.0',
  effectiveFrom: '2026-01-01',

  abilities: [
    {
      key: 'death_strike',
      abilityId: 49998,
      name: '灵界打击 (Death Strike)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'marrowrend',
      abilityId: 195182,
      name: '骨髓分裂 (Marrowrend)',
      kind: 'filler',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'heart_strike',
      abilityId: 206930,
      name: '心脏打击 (Heart Strike)',
      kind: 'filler',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'blood_boil',
      abilityId: 50842,
      name: '沸血术 (Blood Boil)',
      kind: 'aoe',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'vampiric_blood',
      abilityId: 55233,
      name: '吸血鬼之血 (Vampiric Blood)',
      kind: 'defensive',
      cooldownMs: 120_000,
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      key: 'dancing_rune_weapon',
      abilityId: 49028,
      name: '符文武器幻舞 (Dancing Rune Weapon)',
      kind: 'defensive',
      cooldownMs: 240_000,
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
  ],

  buffs: [
    {
      key: 'bone_shield',
      abilityId: 195181,
      name: '白骨之盾 (Bone Shield)',
      kind: 'buff',
      appliesTo: 'self',
      stacks: true,
      expectedUptime: 0.85,
      source: EXISTING_RULES,
      confidence: 0.8,
    },
  ],

  debuffs: [],

  resources: [],

  cooldowns: [
    {
      key: 'vampiric_blood',
      abilityId: 55233,
      name: '吸血鬼之血 (Vampiric Blood)',
      cooldownMs: 120_000,
      kind: 'defensive',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      key: 'dancing_rune_weapon',
      abilityId: 49028,
      name: '符文武器幻舞 (Dancing Rune Weapon)',
      cooldownMs: 240_000,
      kind: 'defensive',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
  ],

  // v1.1.0: the single rotation-driven anchor — Bone Shield layer
  // maintenance. Runic Power thresholds are intentionally absent until the
  // WCL resource label is verified against a real log. Confidence stays at
  // 0.5 (below the mistake gate): the event replay rebuilds stacks from ±1
  // increments and cannot see pre-pull auras, so the observed stack count
  // drifts low on real logs — the rule may explain, never accuse.
  priority: [
    {
      id: 'blood.marrowrend_low_bone_shield',
      action: 'marrowrend',
      when: { buffStacks: [{ key: 'bone_shield', max: 3 }] },
      source: COMMUNITY,
      confidence: 0.5,
      rationale:
        '白骨之盾层数 ≤3 时优先骨髓分裂补层；掉光骨盾会直接损失急速与减伤（叠层重放存在漂移，仅供解释不作定责）',
    },
  ],

  sources: [LOG_VERIFIED, EXISTING_RULES, COMMUNITY],
};
