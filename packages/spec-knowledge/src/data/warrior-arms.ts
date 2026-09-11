import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Arms Warrior knowledge (Midnight 12.1).
 *
 * Colossus Smash id (167105) and its 45 s cooldown are verified against
 * wowdb/wowhead spell pages. Mortal Strike (12294), Avatar (107574),
 * Bladestorm (227847), Overpower (7384), Slam (1464), Execute (163201),
 * Rend (772), Cleave (845) and Sweeping Strikes (260708) are long-standing
 * ids cross-checked against the 12.1 guide rotations.
 *
 * Midnight-specific notes: Rend is Arms-only again (10 Rage), Demolish has a
 * fixed 30 s cooldown (down from 45 s, 12.1), Mortal Strike no longer
 * reduces Demolish's cooldown. Demolish / Heroic Strike ids are not verified
 * yet — they stay descriptive-only, no rule targets them.
 *
 * Cooldown caveats: Colossus Smash is frequently reset by Tactician and
 * reduced by Anger Management, so real intervals are often SHORTER than
 * 45 s — early casts are never penalized, only sustained delays are.
 */

const WOWDB: KnowledgeSource = {
  type: 'community',
  reference:
    'wowdb / wowhead spell pages — Colossus Smash 167105, 45 s cooldown (verified)',
};

const ICY_VEINS: KnowledgeSource = {
  type: 'community',
  reference:
    'icy-veins Arms Warrior rotation & cooldowns, updated for Patch 12.1',
};

const MAXROLL: KnowledgeSource = {
  type: 'community',
  reference: 'maxroll.gg Arms Warrior Raid Guide, Patch 12.1 - Midnight',
};

const PATCH_NOTES: KnowledgeSource = {
  type: 'community',
  reference:
    'Curse of Ula\'tek content update notes (12.1): Demolish fixed 30 s cooldown, Rend Arms-only',
};

export const ARMS_WARRIOR_KNOWLEDGE: SpecKnowledge = {
  specId: 71,
  specName: 'Arms',
  className: 'Warrior',
  patch: 'current',
  knowledgeVersion: '1.1.0',
  effectiveFrom: '2026-01-01',

  abilities: [
    {
      key: 'colossus_smash',
      abilityId: 167105,
      name: '巨人打击 (Colossus Smash)',
      kind: 'cooldown',
      cooldownMs: 45_000,
      source: WOWDB,
      confidence: 0.9,
    },
    {
      key: 'avatar',
      abilityId: 107574,
      name: '天神下凡 (Avatar)',
      kind: 'cooldown',
      cooldownMs: 90_000,
      source: ICY_VEINS,
      confidence: 0.7,
    },
    {
      key: 'bladestorm',
      abilityId: 227847,
      name: '剑刃风暴 (Bladestorm)',
      kind: 'cooldown',
      cooldownMs: 90_000,
      source: ICY_VEINS,
      confidence: 0.6,
    },
    {
      key: 'ravager',
      abilityId: 152277,
      name: '蹂躏者 (Ravager)',
      kind: 'cooldown',
      cooldownMs: 90_000,
      source: ICY_VEINS,
      confidence: 0.6,
    },
    {
      key: 'mortal_strike',
      abilityId: 12294,
      name: '致死打击 (Mortal Strike)',
      kind: 'damage',
      cooldownMs: 6_000,
      source: MAXROLL,
      confidence: 0.8,
    },
    {
      key: 'overpower',
      abilityId: 7384,
      name: '压制 (Overpower)',
      kind: 'damage',
      source: MAXROLL,
      confidence: 0.8,
    },
    {
      key: 'execute',
      abilityId: 163201,
      name: '斩杀 (Execute)',
      kind: 'damage',
      source: MAXROLL,
      confidence: 0.8,
    },
    {
      key: 'slam',
      abilityId: 1464,
      name: '猛击 (Slam)',
      kind: 'filler',
      source: MAXROLL,
      confidence: 0.8,
    },
    {
      key: 'rend',
      abilityId: 772,
      name: '撕裂 (Rend)',
      kind: 'damage',
      source: PATCH_NOTES,
      confidence: 0.8,
    },
    {
      key: 'cleave',
      abilityId: 845,
      name: '顺劈斩 (Cleave)',
      kind: 'aoe',
      source: ICY_VEINS,
      confidence: 0.8,
    },
    {
      key: 'sweeping_strikes',
      abilityId: 260708,
      name: '横扫攻击 (Sweeping Strikes)',
      kind: 'damage',
      source: ICY_VEINS,
      confidence: 0.7,
    },
    {
      // Midnight ability, id not verified — descriptive only.
      key: 'demolish',
      name: '摧毁 (Demolish)',
      kind: 'cooldown',
      cooldownMs: 30_000,
      source: PATCH_NOTES,
      confidence: 0.7,
    },
  ],

  buffs: [],

  debuffs: [
    {
      key: 'rend',
      abilityId: 772,
      name: '撕裂 (Rend)',
      kind: 'debuff',
      appliesTo: 'enemy',
      source: PATCH_NOTES,
      confidence: 0.8,
    },
  ],

  resources: [
    {
      type: 'Rage',
      cap: 100,
      source: MAXROLL,
      confidence: 0.8,
    },
  ],

  cooldowns: [
    {
      key: 'colossus_smash',
      abilityId: 167105,
      name: '巨人打击 (Colossus Smash)',
      cooldownMs: 45_000,
      kind: 'offensive',
      source: WOWDB,
      confidence: 0.9,
    },
    {
      key: 'avatar',
      abilityId: 107574,
      name: '天神下凡 (Avatar)',
      cooldownMs: 90_000,
      kind: 'offensive',
      source: ICY_VEINS,
      confidence: 0.7,
    },
    {
      key: 'bladestorm',
      abilityId: 227847,
      name: '剑刃风暴 (Bladestorm)',
      cooldownMs: 90_000,
      kind: 'offensive',
      source: ICY_VEINS,
      confidence: 0.6,
    },
    {
      key: 'ravager',
      abilityId: 152277,
      name: '蹂躏者 (Ravager)',
      cooldownMs: 90_000,
      kind: 'offensive',
      source: ICY_VEINS,
      confidence: 0.6,
    },
    {
      key: 'demolish',
      name: '摧毁 (Demolish)',
      cooldownMs: 30_000,
      kind: 'offensive',
      source: PATCH_NOTES,
      confidence: 0.7,
    },
  ],

  // Observable-only priority. Rage thresholds and Sudden Death stacks are
  // not encoded until the WCL resource labels / aura ids are verified
  // against a real log.
  priority: [
    {
      id: 'arms.colossus_smash_on_cd',
      action: 'colossus_smash',
      when: { cooldownReady: ['colossus_smash'] },
      source: ICY_VEINS,
      confidence: 0.7,
      rationale:
        '巨人打击开启主要增伤窗口（目标受到的伤害 +30%/10s），就绪即用，延迟会连锁导致其他 CD 失同步',
    },
    {
      id: 'arms.avatar_on_cd',
      action: 'avatar',
      when: { cooldownReady: ['avatar'] },
      source: ICY_VEINS,
      confidence: 0.6,
      rationale: '天神下凡尽量与巨人打击对齐使用',
    },
    {
      id: 'arms.bladestorm_on_cd',
      action: 'bladestorm',
      when: { cooldownReady: ['bladestorm'] },
      source: MAXROLL,
      confidence: 0.6,
      rationale: '剑刃风暴尽量卡在巨人打击 debuff 窗口内释放',
    },
    {
      id: 'arms.cleave_aoe',
      action: 'cleave',
      when: { targetCountMin: 3 },
      scenario: 'aoe',
      source: ICY_VEINS,
      // 0.55 (deliberately below the 0.6 mistake gate): 12.x Arms cleaves its
      // single-target spenders (Mortal Strike / Overpower) through the
      // Whirlwind buff, which this knowledge does not model yet. Treating
      // "Cleave is the only valid AoE spender" as authoritative would flag
      // real M+ AoE rotations as mistakes (191 false flags on the
      // fXdMjWKJbpna6yHv verification log, 2026-09-09). Downgraded to
      // explain-only until the Whirlwind-cleave mechanic is verified and
      // modeled.
      confidence: 0.55,
      rationale:
        '多目标（≥3）场景以顺劈斩为主消耗；注：旋风斩顺劈化机制未建模，单体技能在多目标下的顺劈形态不作定责（conf 低于定责门槛）',
    },
  ],

  notes: [
    {
      id: 'arms.colossus_smash_actual_cd',
      title: '巨人打击实际 CD 常短于 45s',
      content:
        '战术家（Tactician）触发会重置巨人打击，愤怒管理（Anger Management）持续缩短其冷却——实际间隔往往小于 45s。延迟判定只罚「晚于理论槽位」，提前施放不计为问题。',
      source: ICY_VEINS,
      confidence: 0.8,
    },
    {
      id: 'arms.rend_maintenance',
      title: '12.1 撕裂回归武器战专属',
      content:
        '撕裂重新成为武器战专属技能（10 怒气）；单体手工维持，AoE 构型用顺劈斩施加。剩余 <10s 且巨人打击就绪时优先补撕裂。',
      source: PATCH_NOTES,
      confidence: 0.8,
    },
  ],

  sources: [WOWDB, ICY_VEINS, MAXROLL, PATCH_NOTES],
};
