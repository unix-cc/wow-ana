import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Arcane Mage knowledge (patch 12.1, per the player's guide).
 *
 * Provenance:
 * - Ability ids for Arcane Blast / Missiles / Barrage / Clearcasting were
 *   verified against real WCL logs (`@wcl/analysis-engine` constants).
 * - ⚠️ Arcane Power (12042) is **historical only**: the burst ability was
 *   reworked into Arcane Surge in Dragonflight (10.0, 2022-10) and fully
 *   removed by 10.1.5 (2023-07). Current logs never contain 12042, so the
 *   cooldown-delay rule must key on Arcane Surge (365350) — see
 *   `cooldowns.arcane_surge`.
 * - All other spell ids were supplied by the player (2026-09):
 *     arcane_soul          451038  (奥术之魂 / Arcane Soul)
 *     arcane_salvo         384452  (齐射 — core salvo resource / talent mechanic)
 *     tier_4pc_damage_buff 1242974 (12.1 四件套 “下一次技能增伤” buff)
 *     prismatic_bolt       1295924 (棱彩飞弹)
 *     arcane_orb           153640  (宝珠 / Arcane Orb)
 *     arcane_surge         365350  (涌动 / Arcane Surge)
 *
 * ⚠️ **两个对象都叫 "Arcane Salvo"（384452 与 1242974），但在本系统里必须拆成两个
 * BuffKnowledge 对象**：384452 是奥法的核心齐射资源/天赋机制（叠层计数器，
 * `stacks: true`）；1242974 是 12.1 四件套提供的“下一次技能增伤”buff（12.1 四件套
 * 本身就是通过奥术飞弹波数叠加该增伤）。spell id 是唯一判别键。
 *
 * The priority list, openers and channelling mechanics come from the player's
 * current-patch guide. Values still await cross-checking against SimC /
 * patch notes, so rotation rules stay below `MIN_MISTAKE_CONFIDENCE` where
 * appropriate.
 */

const PLAYER_GUIDE: KnowledgeSource = {
  type: 'manual',
  reference:
    '玩家提供的奥法 12.1 攻略与 spell id（2026-09）：arcane_soul 451038 / ' +
    'arcane_salvo 384452 / tier_4pc_damage_buff 1242974 / prismatic_bolt 1295924 / ' +
    'arcane_orb 153640 / arcane_surge 365350。数值与 SimC/patch notes 待交叉验证。',
};

const LOG_VERIFIED: KnowledgeSource = {
  type: 'manual',
  reference:
    'verified against real WCL logs, see packages/analysis-engine/src/specs/mage/arcane/constants.ts',
};

const EXISTING_RULES: KnowledgeSource = {
  type: 'manual',
  reference:
    'thresholds extracted from the pre-refactor arcane rules (clearcasting-waste / arcane-charges-overflow / arcane-power-delay)',
};

/**
 * Arcane Surge cooldown is modelled at 90s: the Dragonflight rework preview
 * (wowhead 328151, baseline 90s since 10.0) and the icy-veins 12.1 guide
 * (2026-08, no cooldown change recorded) both describe the same cadence.
 * Confidence is kept below game-tooltip certainty; CD-reducing talents are
 * not modelled.
 */
const SURGE_CD: KnowledgeSource = {
  type: 'manual',
  reference:
    'Arcane Surge cooldownMs 90_000：wowhead 328151（10.0 重做为 90s）与 ' +
    'icy-veins 12.1 奥法指南（2026-08，无 CD 改动记录）。confidence 0.7，' +
    '待游戏内 tooltip 复核；减 CD 天赋未建模。burstDurationMs 6_000：' +
    'icy-veins 12.1「Arcane Surge 开启爆发窗口」，buff 时长约 6s（2026-09 探针' +
    '实测 cast 后 8s 内约 7 GCD）；时长仅供窗口分桶，不作判定。',
};

/**
 * Arcane Orb cooldown is modelled at 20s: Wowpedia "Arcane Orb" (Arcane mage
 * talent, 20 sec cooldown) and wowhead's live spell page both describe the
 * same cadence. Confidence kept below game-tooltip certainty; CD-reducing
 * talents (e.g. Charged Orb variants) are not modelled.
 */
const ORB_CD: KnowledgeSource = {
  type: 'manual',
  reference:
    'Arcane Orb cooldownMs 20_000：Wowpedia「Arcane Orb」（奥法天赋，20 sec ' +
    'cooldown）与 wowhead 现行法术页（2026-09 复核）。confidence 0.7，' +
    '待游戏内 tooltip 复核；减 CD 天赋未建模。',
};

export const ARCANE_MAGE_KNOWLEDGE: SpecKnowledge = {
  specId: 62,
  specName: 'Arcane',
  className: 'Mage',
  patch: '12.1',
  knowledgeVersion: '1.5.0',
  effectiveFrom: '2026-01-01',

  abilities: [
    {
      key: 'arcane_blast',
      abilityId: 30451,
      name: '奥冲 (Arcane Blast)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'arcane_missiles',
      abilityId: 5143,
      name: '飞弹 (Arcane Missiles)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'arcane_barrage',
      abilityId: 44425,
      name: '弹幕 (Arcane Barrage)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'arcane_surge',
      abilityId: 365350,
      name: '涌动 (Arcane Surge)',
      kind: 'cooldown',
      cooldownMs: 90_000,
      source: PLAYER_GUIDE,
      confidence: 0.9,
    },
    {
      key: 'arcane_orb',
      abilityId: 153640,
      name: '宝珠 (Arcane Orb)',
      kind: 'damage',
      cooldownMs: 20_000,
      source: PLAYER_GUIDE,
      confidence: 0.9,
    },
    {
      key: 'prismatic_bolt',
      abilityId: 1295924,
      name: '棱彩飞弹 (Prismatic Bolt)',
      kind: 'damage',
      source: PLAYER_GUIDE,
      confidence: 0.9,
    },
  ],

  buffs: [
    {
      key: 'clearcasting',
      abilityId: 263725,
      name: '节能施法 (Clearcasting)',
      kind: 'buff',
      appliesTo: 'self',
      source: EXISTING_RULES,
      confidence: 0.8,
    },
    {
      key: 'arcane_charge',
      name: '奥术充能 (Arcane Charge, id 待核对)',
      kind: 'buff',
      appliesTo: 'self',
      stacks: true,
      source: PLAYER_GUIDE,
      confidence: 0.6,
    },
    {
      key: 'arcane_soul',
      abilityId: 451038,
      name: '奥术之魂 (Arcane Soul)',
      kind: 'buff',
      appliesTo: 'self',
      source: PLAYER_GUIDE,
      confidence: 0.9,
    },
    {
      key: 'arcane_salvo',
      abilityId: 384452,
      name: '奥术齐射（核心资源/天赋机制）',
      kind: 'buff',
      appliesTo: 'self',
      stacks: true,
      source: PLAYER_GUIDE,
      confidence: 0.9,
    },
    {
      key: 'tier_4pc_damage_buff',
      abilityId: 1242974,
      name: '奥术齐射（12.1 四件套“下一次技能增伤”buff）',
      kind: 'buff',
      appliesTo: 'self',
      source: PLAYER_GUIDE,
      confidence: 0.9,
    },
  ],

  debuffs: [],

  resources: [
    {
      type: 'Mana',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
  ],

  cooldowns: [
    {
      key: 'arcane_surge',
      abilityId: 365350,
      name: '涌动 (Arcane Surge)',
      cooldownMs: 90_000,
      kind: 'offensive',
      burstDurationMs: 6_000,
      source: SURGE_CD,
      confidence: 0.7,
    },
    {
      key: 'arcane_orb',
      abilityId: 153640,
      name: '宝珠 (Arcane Orb)',
      cooldownMs: 20_000,
      kind: 'offensive',
      source: ORB_CD,
      confidence: 0.7,
    },
  ],

  // Translated from the player's priority list (2026-09):
  //   1 弹幕（有奥术之魂）    2 飞弹（齐射<12）      3 棱彩飞弹（有套装增伤）
  //   4 弹幕（齐射=25 / 齐射≥12且有节能 / AOE:齐射≥12且有可用宝珠且目标≥3）
  //   5 宝珠（奥术充能<3）   6 奥冲（默认填充）      7 弹幕（没蓝）
  // 齐射 = Arcane Salvo(384452) stacks. Stack predicates use inclusive bounds:
  //   齐射<12 → arcane_salvo.max 11；齐射=25 → min/max 25；充能<3 → arcane_charge.max 2。
  //
  // ⚠️ 第 4c 条（齐射≥12 + 可用宝珠 + 目标≥3）是 **AOE 专属优先级**（scenario:'aoe'）：
  // 单目标 / 双目标场景下这条规则要**整条删除**，而不是"目标数不满足就不命中"。
  priority: [
    {
      id: 'arcane.soul_barrage',
      action: 'arcane_barrage',
      when: { buffActive: ['arcane_soul'] },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: '奥术之魂期间用弹幕倾泻',
    },
    {
      id: 'arcane.missiles_salvo_low',
      action: 'arcane_missiles',
      when: { buffStacks: [{ key: 'arcane_salvo', max: 11 }] },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: '齐射<12 时用飞弹攒齐射',
    },
    {
      id: 'arcane.prismatic_tier_buff',
      action: 'prismatic_bolt',
      when: { buffActive: ['tier_4pc_damage_buff'] },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: '套装增伤（Arcane Salvo 1242974）期间用棱彩飞弹吃掉增伤',
    },
    {
      id: 'arcane.barrage_salvo25',
      action: 'arcane_barrage',
      when: { buffStacks: [{ key: 'arcane_salvo', min: 25, max: 25 }] },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: '齐射叠满（25）立刻弹幕',
    },
    {
      id: 'arcane.barrage_clearcast',
      action: 'arcane_barrage',
      when: {
        buffStacks: [{ key: 'arcane_salvo', min: 12 }],
        buffActive: ['clearcasting'],
      },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: '齐射≥12 且有节能时弹幕',
    },
    {
      id: 'arcane.barrage_orb_aoe',
      action: 'arcane_barrage',
      scenario: 'aoe',
      when: {
        buffStacks: [{ key: 'arcane_salvo', min: 12 }],
        cooldownReady: ['arcane_orb'],
        targetCountMin: 3,
      },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: 'AOE：齐射≥12 且有可用宝珠且目标≥3 时弹幕',
    },
    {
      id: 'arcane.orb_low_charges',
      action: 'arcane_orb',
      when: { buffStacks: [{ key: 'arcane_charge', max: 2 }] },
      source: PLAYER_GUIDE,
      confidence: 0.8,
      rationale: '奥术充能<3 时放宝珠补充能',
    },
    {
      id: 'arcane.blast_builder',
      action: 'arcane_blast',
      when: {},
      source: PLAYER_GUIDE,
      confidence: 0.6,
      rationale: '默认填充：奥冲（注意涌动最后2秒 / 奥术之魂期间不打弹幕的窗口细节）',
    },
    {
      id: 'arcane.barrage_oom',
      action: 'arcane_barrage',
      when: { resourceMax: 5 },
      source: PLAYER_GUIDE,
      confidence: 0.6,
      rationale: '蓝量很低时用无消耗弹幕收尾',
    },
  ],

  notes: [
    {
      id: 'arcane.opener_standard',
      title: '爆发起手（大部分起手）',
      content: '预读涌动(Arcane Surge) → 药水+飞弹 → 饰品+弹幕触',
      source: PLAYER_GUIDE,
      confidence: 0.8,
    },
    {
      id: 'arcane.opener_stolen',
      title: '爆发起手（团本偷层数）',
      content: '预读奥冲 → 宝珠 → 药水+涌动(Arcane Surge) → 饰品+弹幕触',
      source: PLAYER_GUIDE,
      confidence: 0.8,
    },
    {
      id: 'arcane.double_missiles',
      title: '2 连飞弹机制（引导补偿）',
      content:
        '连续引导飞弹时，在第一个飞弹的倒数第二跳结束后立即引导新的飞弹，' +
        '第一个飞弹的最后一跳会被补偿到第二个飞弹中，不损失总跳数。' +
        '操作条件：至少 2 层节能 + 0 层齐射且没有过载时，第一个飞弹第 7 跳结束后立即引导新飞弹。',
      source: PLAYER_GUIDE,
      confidence: 0.8,
    },
    {
      id: 'arcane.touch_window',
      title: '涌动结束前手法',
      content:
        '涌动最后 2 秒内不打弹幕；技能优先级——单体：棱彩飞弹 > 飞弹 > 奥冲；' +
        'AOE：棱彩飞弹 > 飞弹 > 宝珠/奥冲。',
      source: PLAYER_GUIDE,
      confidence: 0.8,
    },
    {
      id: 'arcane.soul_after_touch',
      title: '进奥术之魂后',
      content: '打断飞弹（包括过载飞弹）；不要刻意补技能拿敏锐直觉。',
      source: PLAYER_GUIDE,
      confidence: 0.8,
    },
  ],

  sources: [PLAYER_GUIDE, LOG_VERIFIED, EXISTING_RULES, SURGE_CD, ORB_CD],
};
