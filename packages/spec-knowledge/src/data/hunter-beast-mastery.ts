import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Beast Mastery Hunter knowledge.
 *
 * Ability IDs were verified against real WCL logs (cn.warcraftlogs.com), so
 * they are recorded as `manual` sources with confidence 1.0. Rotation
 * priorities are community theorycraft and are deliberately given lower
 * confidence — see `MIN_MISTAKE_CONFIDENCE`: below 0.6 the engine may only
 * emit `potential` / `suggestion`, never a `mistake`.
 */

const ABILITY_IDS: KnowledgeSource = {
  type: 'manual',
  reference:
    'verified against real WCL logs (cn.warcraftlogs.com), see packages/analysis-engine/src/specs/hunter/beast-mastery/constants.ts',
};

const EXISTING_RULES: KnowledgeSource = {
  type: 'manual',
  reference:
    'thresholds extracted from the pre-refactor BM rules (kill-command / barbed-shot-uptime / beast-cleave-uptime / cooldown-delay)',
};

const COMMUNITY: KnowledgeSource = {
  type: 'community',
  reference: 'Beast Mastery rotation guides (needs verification)',
};

export const BEAST_MASTERY_KNOWLEDGE: SpecKnowledge = {
  specId: 253,
  specName: 'Beast Mastery',
  className: 'Hunter',
  patch: 'current',
  knowledgeVersion: '1.1.0',
  effectiveFrom: '2026-01-01',

  abilities: [
    {
      key: 'kill_command',
      abilityId: 34026,
      name: '杀戮命令 (Kill Command)',
      kind: 'damage',
      cooldownMs: 6_000,
      minCastRatio: 0.8,
      source: EXISTING_RULES,
      confidence: 0.9,
    },
    {
      key: 'barbed_shot',
      abilityId: 217200,
      name: '倒刺射击 (Barbed Shot)',
      kind: 'damage',
      source: ABILITY_IDS,
      confidence: 1,
    },
    {
      key: 'cobra_shot',
      abilityId: 193455,
      name: '眼镜蛇射击 (Cobra Shot)',
      kind: 'filler',
      source: ABILITY_IDS,
      confidence: 1,
    },
    {
      key: 'multi_shot',
      abilityId: 2643,
      name: '多重射击 (Multi-Shot)',
      kind: 'aoe',
      source: ABILITY_IDS,
      confidence: 1,
    },
    {
      key: 'bestial_wrath',
      abilityId: 19574,
      name: '狂野怒火 (Bestial Wrath)',
      kind: 'cooldown',
      cooldownMs: 90_000,
      source: EXISTING_RULES,
      confidence: 0.9,
    },
    {
      key: 'call_of_the_wild',
      abilityId: 359844,
      name: '荒野的召唤 (Call of the Wild)',
      kind: 'cooldown',
      source: ABILITY_IDS,
      confidence: 1,
    },
  ],

  buffs: [
    {
      key: 'barbed_shot',
      abilityId: 246152,
      name: '倒刺射击 (Barbed Shot)',
      kind: 'buff',
      appliesTo: 'self',
      expectedUptime: 0.8,
      source: EXISTING_RULES,
      confidence: 0.8,
    },
    {
      key: 'beast_cleave',
      abilityId: 115939,
      name: '野兽顺劈 (Beast Cleave)',
      kind: 'buff',
      appliesTo: 'self',
      expectedUptime: 0.7,
      source: EXISTING_RULES,
      confidence: 0.7,
    },
  ],

  debuffs: [],

  resources: [
    {
      type: 'Focus',
      cap: 100,
      source: COMMUNITY,
      confidence: 0.6,
    },
  ],

  cooldowns: [
    {
      key: 'bestial_wrath',
      abilityId: 19574,
      name: '狂野怒火 (Bestial Wrath)',
      cooldownMs: 90_000,
      kind: 'offensive',
      // 15s buff window (wowhead/icy-veins); cast-anchored burst bucketing only.
      burstDurationMs: 15_000,
      source: EXISTING_RULES,
      confidence: 0.9,
    },
    {
      key: 'kill_command',
      abilityId: 34026,
      name: '杀戮命令 (Kill Command)',
      cooldownMs: 6_000,
      kind: 'offensive',
      source: EXISTING_RULES,
      confidence: 0.9,
    },
  ],

  priority: [
    {
      id: 'bm.barbed_shot_frenzy',
      action: 'barbed_shot',
      when: { buffMissing: ['barbed_shot'] },
      source: COMMUNITY,
      confidence: 0.8,
      rationale: '维持 Barbed Shot buff 以驱动宠物攻速',
    },
    {
      id: 'bm.kill_command',
      action: 'kill_command',
      when: { cooldownReady: ['kill_command'] },
      source: COMMUNITY,
      confidence: 0.8,
      rationale: 'Kill Command 是核心伤害技能，应按 CD 使用',
    },
    {
      id: 'bm.beast_cleave_aoe',
      action: 'multi_shot',
      scenario: 'aoe',
      when: { targetCountMin: 3, buffMissing: ['beast_cleave'] },
      source: COMMUNITY,
      confidence: 0.6,
      rationale: '多目标时用 Multi-Shot 维持 Beast Cleave（AOE 专属）',
    },
    {
      id: 'bm.bestial_wrath',
      action: 'bestial_wrath',
      when: { cooldownReady: ['bestial_wrath'] },
      source: COMMUNITY,
      confidence: 0.7,
      rationale: '爆发技能就绪即开，避免 CD 空转',
    },
    {
      id: 'bm.cobra_shot_filler',
      action: 'cobra_shot',
      when: {},
      source: COMMUNITY,
      confidence: 0.6,
      rationale: '填充 GCD，避免空转（低置信度，仅作 Suggestion）',
    },
  ],

  sources: [ABILITY_IDS, EXISTING_RULES, COMMUNITY],
};
