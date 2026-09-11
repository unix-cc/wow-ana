import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Elemental Shaman knowledge.
 *
 * Ability IDs and cooldowns were verified against real WCL logs — they are
 * lifted from the pre-refactor `specs/shaman/elemental/constants.ts` and the
 * cooldown-delay rules that already ran in production (Phase 5.5). Rotation
 * priorities are deliberately minimal community heuristics: only rules whose
 * conditions are observable with the verified data (Lava Surge proc buff,
 * cooldown readiness) are encoded. Abilities without a verified ID
 * (Lightning Bolt, Chain Lightning, Earth Shock, Earthquake, Maelstrom
 * resource) are intentionally left out rather than guessed — they join when
 * the player supplies verified ids (same discipline as the arcane charge).
 */

const LOG_VERIFIED: KnowledgeSource = {
  type: 'manual',
  reference:
    'verified against real WCL logs, see packages/analysis-engine/src/specs/shaman/elemental/constants.ts (ability ids) and the pre-refactor stormkeeper/fire-elemental delay rules (cooldowns)',
};

const EXISTING_RULES: KnowledgeSource = {
  type: 'manual',
  reference:
    'thresholds extracted from the pre-refactor elemental rules (flame-shock-uptime / lava-surge-waste)',
};

const COMMUNITY: KnowledgeSource = {
  type: 'community',
  reference: 'Elemental Shaman rotation guides (needs verification)',
};

export const ELEMENTAL_SHAMAN_KNOWLEDGE: SpecKnowledge = {
  specId: 262,
  specName: 'Elemental',
  className: 'Shaman',
  patch: 'current',
  knowledgeVersion: '1.0.0',
  effectiveFrom: '2026-01-01',

  abilities: [
    {
      key: 'flame_shock',
      abilityId: 188389,
      name: '烈焰震击 (Flame Shock)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'lava_burst',
      abilityId: 51505,
      name: '熔岩爆裂 (Lava Burst)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'stormkeeper',
      abilityId: 191634,
      name: '风暴守护者 (Stormkeeper)',
      kind: 'cooldown',
      cooldownMs: 60_000,
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      key: 'fire_elemental',
      abilityId: 198067,
      name: '火元素 (Fire Elemental)',
      kind: 'cooldown',
      cooldownMs: 120_000,
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
  ],

  buffs: [
    {
      key: 'lava_surge',
      abilityId: 77762,
      name: '熔岩涌动 (Lava Surge)',
      kind: 'buff',
      appliesTo: 'self',
      // Id verified against logs; the confidence reflects the attached
      // expectation ("procs should be consumed promptly by Lava Burst"),
      // mirroring the BM barbed-shot buff entry.
      source: EXISTING_RULES,
      confidence: 0.8,
    },
  ],

  debuffs: [
    {
      key: 'flame_shock',
      abilityId: 188389,
      name: '烈焰震击 (Flame Shock)',
      kind: 'debuff',
      appliesTo: 'enemy',
      expectedUptime: 0.8,
      source: EXISTING_RULES,
      confidence: 0.7,
    },
  ],

  resources: [],

  cooldowns: [
    {
      key: 'stormkeeper',
      abilityId: 191634,
      name: '风暴守护者 (Stormkeeper)',
      cooldownMs: 60_000,
      kind: 'offensive',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      key: 'fire_elemental',
      abilityId: 198067,
      name: '火元素 (Fire Elemental)',
      cooldownMs: 120_000,
      kind: 'offensive',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
  ],

  // Minimal, observable-only priority. Single-target filler (Lightning Bolt)
  // has no verified id yet, so no default-filler rule exists: decisions the
  // list cannot explain stay `unknown` instead of being force-judged.
  priority: [
    {
      id: 'elemental.lava_burst_on_surge',
      action: 'lava_burst',
      when: { buffActive: ['lava_surge'] },
      source: COMMUNITY,
      confidence: 0.7,
      rationale: '熔岩涌动触发后熔岩爆裂变为瞬发，应尽快消耗',
    },
    {
      id: 'elemental.stormkeeper_on_cd',
      action: 'stormkeeper',
      when: { cooldownReady: ['stormkeeper'] },
      source: COMMUNITY,
      confidence: 0.6,
      rationale: '风暴守护者就绪即开，强化后续闪电箭',
    },
    {
      id: 'elemental.fire_elemental_on_cd',
      action: 'fire_elemental',
      when: { cooldownReady: ['fire_elemental'] },
      source: COMMUNITY,
      confidence: 0.6,
      rationale: '火元素是大招，CD 好了尽早召唤',
    },
  ],

  sources: [LOG_VERIFIED, EXISTING_RULES, COMMUNITY],
};
