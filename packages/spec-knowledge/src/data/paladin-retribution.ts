import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Retribution Paladin knowledge (Midnight 12.1).
 *
 * Spell ids for Blade of Justice (184575), Wake of Ashes (255937) and
 * Final Verdict (383328) are verified against Blizzard's own spell dumps
 * (community forum hotfix posts expose raw spell ids). Avenging Wrath
 * (31884), Execution Sentence (343527), Templar's Verdict (85256),
 * Divine Storm (53385), Judgment (20271), Crusader Strike (35395) and
 * Hammer of Wrath (24275) are long-standing ids cross-checked against the
 * 12.1 guide rotations (icy-veins / method / wowhead).
 *
 * Cooldowns: Avenging Wrath 2 min (wowdb spell page), Execution Sentence
 * 60 s (icy-veins spell glossary, 12.1), Wake of Ashes 45 s (community).
 *
 * Unverified ids stay undefined on purpose (Templar hero talent Hammer of
 * Light, Divine Toll, Art of War proc buff): rules targeting them stay
 * dormant rather than guessing — same discipline as the arcane charge.
 */

const SPELL_DUMP: KnowledgeSource = {
  type: 'manual',
  reference:
    'Blizzard forum spell dumps (us.forums.blizzard.com hotfix threads, raw spell ids for 184575 / 255937 / 383328)',
};

const ICY_VEINS: KnowledgeSource = {
  type: 'community',
  reference:
    'icy-veins Retribution Paladin rotation & spell summary, updated for Patch 12.1 (11 Aug 2026)',
};

const METHOD: KnowledgeSource = {
  type: 'community',
  reference: 'method.gg Retribution Paladin Playstyle and Rotation, Midnight 12.1',
};

export const RETRIBUTION_PALADIN_KNOWLEDGE: SpecKnowledge = {
  specId: 70,
  specName: 'Retribution',
  className: 'Paladin',
  patch: 'current',
  knowledgeVersion: '1.1.0',
  effectiveFrom: '2026-01-01',

  abilities: [
    {
      key: 'avenging_wrath',
      abilityId: 31884,
      name: '复仇之怒 (Avenging Wrath)',
      kind: 'cooldown',
      cooldownMs: 120_000,
      source: SPELL_DUMP,
      confidence: 0.9,
    },
    {
      key: 'execution_sentence',
      abilityId: 343527,
      name: '审判官裁决 (Execution Sentence)',
      kind: 'cooldown',
      cooldownMs: 60_000,
      source: ICY_VEINS,
      confidence: 0.8,
    },
    {
      key: 'wake_of_ashes',
      abilityId: 255937,
      name: '灰烬觉醒 (Wake of Ashes)',
      kind: 'cooldown',
      cooldownMs: 45_000,
      source: SPELL_DUMP,
      confidence: 0.8,
    },
    {
      key: 'blade_of_justice',
      abilityId: 184575,
      name: '公正之剑 (Blade of Justice)',
      kind: 'damage',
      source: SPELL_DUMP,
      confidence: 0.9,
    },
    {
      key: 'final_verdict',
      abilityId: 383328,
      name: '最终裁决 (Final Verdict)',
      kind: 'damage',
      source: SPELL_DUMP,
      confidence: 0.8,
    },
    {
      key: 'templars_verdict',
      abilityId: 85256,
      name: '圣殿骑士的裁决 (Templar\'s Verdict)',
      kind: 'damage',
      source: METHOD,
      confidence: 0.8,
    },
    {
      key: 'divine_storm',
      abilityId: 53385,
      name: '神圣风暴 (Divine Storm)',
      kind: 'aoe',
      source: METHOD,
      confidence: 0.8,
    },
    {
      key: 'judgment',
      abilityId: 20271,
      name: '审判 (Judgment)',
      kind: 'damage',
      source: METHOD,
      confidence: 0.7,
    },
    {
      key: 'crusader_strike',
      abilityId: 35395,
      name: '十字军打击 (Crusader Strike)',
      kind: 'filler',
      source: METHOD,
      confidence: 0.7,
    },
    {
      key: 'hammer_of_wrath',
      abilityId: 24275,
      name: '愤怒之锤 (Hammer of Wrath)',
      kind: 'damage',
      source: METHOD,
      confidence: 0.7,
    },
    {
      // Id not verified for the Midnight version — descriptive only, no
      // rule targets it. Stays dormant until an id is supplied.
      key: 'divine_toll',
      name: '神圣鸣钟 (Divine Toll)',
      kind: 'cooldown',
      source: ICY_VEINS,
      confidence: 0.6,
    },
  ],

  buffs: [
    {
      key: 'avenging_wrath',
      abilityId: 31884,
      name: '复仇之怒 (Avenging Wrath)',
      kind: 'buff',
      appliesTo: 'self',
      source: SPELL_DUMP,
      confidence: 0.8,
    },
    {
      // Art of War proc buff (2 stacks) reshapes the 12.1 priority, but the
      // aura id is not verified — no condition may depend on it yet.
      key: 'art_of_war',
      name: '战争艺术 (Art of War)',
      kind: 'buff',
      appliesTo: 'self',
      stacks: true,
      source: ICY_VEINS,
      confidence: 0.6,
    },
  ],

  debuffs: [],

  resources: [
    {
      type: 'Holy Power',
      cap: 5,
      source: METHOD,
      confidence: 0.7,
    },
  ],

  cooldowns: [
    {
      key: 'avenging_wrath',
      abilityId: 31884,
      name: '复仇之怒 (Avenging Wrath)',
      cooldownMs: 120_000,
      kind: 'offensive',
      // 20s buff window (icy-veins 12.1); cast-anchored burst bucketing
      // only — 辐耀荣光构型下由灰烬觉醒自动触发，未手动施放不一定是错误。
      burstDurationMs: 20_000,
      source: SPELL_DUMP,
      confidence: 0.9,
    },
    {
      key: 'execution_sentence',
      abilityId: 343527,
      name: '审判官裁决 (Execution Sentence)',
      cooldownMs: 60_000,
      kind: 'offensive',
      source: ICY_VEINS,
      confidence: 0.8,
    },
    {
      key: 'wake_of_ashes',
      abilityId: 255937,
      name: '灰烬觉醒 (Wake of Ashes)',
      cooldownMs: 45_000,
      kind: 'offensive',
      source: SPELL_DUMP,
      confidence: 0.8,
    },
  ],

  // Observable-only priority: cooldown readiness is verifiable from cast
  // events; Holy Power amounts and Art of War stacks are not encoded until
  // the WCL resource labels / aura ids are verified against a real log.
  priority: [
    {
      id: 'retribution.avenging_wrath_on_cd',
      action: 'avenging_wrath',
      when: { cooldownReady: ['avenging_wrath'] },
      source: METHOD,
      confidence: 0.7,
      rationale:
        '复仇之怒是主要爆发 CD，就绪即开并尽量与审判官裁决对齐（12.1 辐耀荣光构型下由灰烬觉醒自动触发，未手动施放不一定是错误）',
    },
    {
      id: 'retribution.execution_sentence_on_cd',
      action: 'execution_sentence',
      when: { cooldownReady: ['execution_sentence'] },
      source: ICY_VEINS,
      confidence: 0.7,
      rationale: '审判官裁决 60s CD，就绪即用以吃满后续伤害的 20% 结算',
    },
    {
      id: 'retribution.wake_of_ashes_on_cd',
      action: 'wake_of_ashes',
      when: { cooldownReady: ['wake_of_ashes'] },
      source: ICY_VEINS,
      confidence: 0.7,
      rationale: '灰烬觉醒 45s CD 且产生 3 圣能，是最高优先填充/爆发来源',
    },
    {
      id: 'retribution.divine_storm_aoe',
      action: 'divine_storm',
      when: { targetCountMin: 3 },
      scenario: 'aoe',
      source: METHOD,
      confidence: 0.7,
      rationale: '多目标（≥3）场景圣能消耗优先神圣风暴',
    },
  ],

  notes: [
    {
      id: 'retribution.holy_power_cap',
      title: '圣能上限 5，禁止溢出',
      content:
        '12.1 惩戒骑圣能上限 5（升级自旧版 3）。优先用生成技能而非囤积，满 5 圣能时必须先消耗（最终裁决/神圣风暴），任何溢出都是损失。',
      source: METHOD,
      confidence: 0.8,
    },
    {
      id: 'retribution.radiant_glory',
      title: '辐耀荣光构型改变复仇之怒语义',
      content:
        '若点出辐耀荣光（Radiant Glory），复仇之怒不再是主动技能，而是在施放灰烬觉醒时自动触发 8 秒。判定「复仇之怒未使用」前必须先确认天赋构型。',
      source: ICY_VEINS,
      confidence: 0.8,
    },
  ],

  sources: [SPELL_DUMP, ICY_VEINS, METHOD],
};
