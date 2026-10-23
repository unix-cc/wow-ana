import type { KnowledgeSource } from '@wcl/domain';
import type { SpecKnowledge } from '../types.js';

/**
 * Vengeance Demon Hunter knowledge (Midnight 12.1.5, Annihilator).
 *
 * **Every ability id below was read off real WCL events**, not from a guide:
 * the five reference fights are `mnNQW16gjB9azRYx#4`, `ZkNRKgqwvcPATJWF#5`,
 * `gZdfyxDQXNLAcFTR#6/#7`, `2zM7CBymFHtY8XhN#1` (same player, training
 * dummies, 2026-10-23). See `docs/vdh-meteor-12.1.5.md` for the analysis that
 * produced the numbers quoted in the notes.
 *
 * Two deliberate omissions:
 *
 * 1. **`specId` is absent.** WCL's actor feed for those reports returns
 *    `specName: 'Vengeance'` but no spec id (verified 2026-10-23), so matching
 *    is by name. 581 is the well-known Vengeance id; adding it later is a
 *    one-line change once a log actually carries it.
 * 2. **`priority` is empty.** The rotation anchor for this spec is "spend 3
 *    stacks of Voidfall", and that state is *not observable* in the event
 *    replay: WCL emits the Voidfall stack events (1256322) at meteor-impact
 *    time rather than at cast time, so a `buffStacks` rule would read the
 *    wrong state and accuse the player of missing a cast that already
 *    happened. Same lesson as the Blood DK Bone Shield rule, but worse —
 *    there the drift is ±1, here the whole aura is phase-shifted. What the
 *    rotation actually needs is carried in `notes` (explanation material)
 *    instead of the verdict machinery.
 */

const LOG_VERIFIED: KnowledgeSource = {
  type: 'manual',
  reference:
    'event-level WCL data, 5 fights, 2026-10-23 — mnNQW16gjB9azRYx#4, ZkNRKgqwvcPATJWF#5, gZdfyxDQXNLAcFTR#6/#7, 2zM7CBymFHtY8XhN#1 (see docs/vdh-meteor-12.1.5.md)',
};

const TALENT_TEXT: KnowledgeSource = {
  type: 'official',
  reference:
    'in-game talent text 12.1.5: Meteoric Fall (SpellID 1253391), Dark Matter (SpellID 1256307)',
};

const COMMUNITY: KnowledgeSource = {
  type: 'community',
  reference:
    'NGA 复仇流星疑问 (tid=47473219, 2026-08-31) — 3 层逐层消耗 / 炸弹需等爆炸才出流星 / 炸弹后立刻变身会吞层',
};

const GUIDE: KnowledgeSource = {
  type: 'community',
  reference:
    'Icy Veins / Wowhead Vengeance Demon Hunter 12.1.5 talent + rotation pages (Spirit Bomb hasted 25 s cooldown; Metamorphosis 15 s base duration)',
};

export const VENGEANCE_DEMON_HUNTER_KNOWLEDGE: SpecKnowledge = {
  specName: 'Vengeance',
  className: 'Demon Hunter',
  patch: '12.1.5',
  knowledgeVersion: '1.0.0',

  abilities: [
    {
      key: 'soul_cleave',
      abilityId: 228477,
      name: '灵魂裂劈 (Soul Cleave)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'spirit_bomb',
      abilityId: 247454,
      name: '幽魂炸弹 (Spirit Bomb)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      // Fracture also appears under 225919 / 225921 in the same logs
      // (off-hand / variant ids). Only the primary id is declared: the
      // knowledge model maps one id per ability key, and fragment counting
      // is done from the Soul Fragment aura, not from cast counts.
      key: 'fracture',
      abilityId: 263642,
      name: '破裂 (Fracture)',
      kind: 'filler',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      key: 'immolation_aura',
      abilityId: 258920,
      name: '献祭光环 (Immolation Aura)',
      kind: 'aoe',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'sigil_of_flame',
      abilityId: 204596,
      name: '烈焰咒符 (Sigil of Flame)',
      kind: 'aoe',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'fel_devastation',
      abilityId: 212084,
      name: '邪能毁灭 (Fel Devastation)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'sigil_of_spite',
      abilityId: 390163,
      name: '怨念咒符 (Sigil of Spite)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      // 从 gvD6HnCZX32mbTPA#21 的技能表确认（烈火烙印，伤害占比 3.6%）。
      key: 'fiery_brand',
      abilityId: 204021,
      name: '烈火烙印 (Fiery Brand)',
      kind: 'defensive',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'felblade',
      abilityId: 213243,
      name: '邪能之刃 (Felblade)',
      kind: 'filler',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      // 迅疾流星打出的普通流星。颗数 == 本次消耗的虚落层数（3 颗 = 2 普通 +
      // 1 颗灭世灾星），所以「每串几颗」是层数唯一可靠的观测面。
      key: 'voidfall_meteor',
      abilityId: 1256306,
      name: '虚落流星 (Voidfall Meteor)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      // 灭世灾星（World Killer）：每串流星的最后一颗被它替代。
      key: 'world_killer',
      abilityId: 1256617,
      name: '灭世灾星 (World Killer)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      // 暗物质：变身后第一颗幽魂炸弹召唤的暗影烈焰流星雨，12 跳 / 6 秒。
      key: 'dark_matter',
      abilityId: 1264130,
      name: '流星雨 (Dark Matter)',
      kind: 'damage',
      source: LOG_VERIFIED,
      confidence: 1,
    },
  ],

  buffs: [
    {
      // 虚落：Fracture 叠层的资源计数器，3 层时被幽魂炸弹 / 灵魂裂劈消耗。
      // 声明 stacks 是为了让 replay 认识它，不代表它的时序可用（见文件头）。
      key: 'voidfall',
      abilityId: 1256322,
      name: '虚落 (Voidfall)',
      kind: 'buff',
      appliesTo: 'self',
      stacks: true,
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'soul_fragments',
      abilityId: 203981,
      name: '灵魂残片 (Soul Fragments)',
      kind: 'buff',
      appliesTo: 'self',
      stacks: true,
      source: LOG_VERIFIED,
      confidence: 1,
    },
    {
      key: 'demon_spikes',
      abilityId: 203819,
      name: '恶魔尖刺 (Demon Spikes)',
      kind: 'buff',
      appliesTo: 'self',
      source: LOG_VERIFIED,
      confidence: 1,
    },
  ],

  debuffs: [],

  resources: [],

  cooldowns: [
    {
      key: 'metamorphosis',
      abilityId: 187827,
      name: '恶魔变形 (Metamorphosis)',
      cooldownMs: 120_000,
      kind: 'offensive',
      // 15 s base duration (20 s with Vengeful Beast, 10 s on the Apex
      // "Untethered Rage" proc). Used for phase bucketing only — never a
      // verdict: holding Metamorphosis for a tank buster is correct play.
      burstDurationMs: 15_000,
      source: GUIDE,
      confidence: 0.7,
    },
    {
      key: 'spirit_bomb',
      abilityId: 247454,
      name: '幽魂炸弹 (Spirit Bomb)',
      // Hasted 25 s cooldown in Midnight. Observed at most once per 16–33 s
      // fight in the reference logs — consistent, not proof.
      cooldownMs: 25_000,
      kind: 'offensive',
      source: GUIDE,
      confidence: 0.6,
    },
  ],

  // Empty on purpose — see the file header. A stack-gated rule here would be
  // driven by a phase-shifted aura and would manufacture false findings.
  priority: [],

  notes: [
    {
      id: 'vdh.meteoric_fall_settlement',
      title: '迅疾流星：3 层 → 3 颗；炸弹后紧跟裂劈 → 4 颗',
      content:
        '3 层虚落由裂劈或炸弹单独消耗时，落 3 颗流星（2 颗普通虚落流星 + 第 3 颗升级为灭世灾星）。' +
        '幽魂炸弹单独结算也是 3 颗（对照组 E 实测）。但如果在炸弹**爆炸的那一瞬间**按下裂劈，' +
        '整串变成 4 颗（3 普通 + 1 灭世灾星），多算一颗。爆炸前摇 0.94–1.06 s ≈ 一个 GCD，' +
        '所以"炸弹 → 下一刀裂劈"的自然按法就会命中，不需要卡帧。',
      source: LOG_VERIFIED,
      confidence: 0.8,
    },
    {
      id: 'vdh.dark_matter_window',
      title: '暗物质：只认变身后第一颗炸弹，12 跳 6 秒',
      content:
        '进入恶魔变身后的**第一次幽魂炸弹**触发暗影烈焰流星雨（SpellID 1264130），12 跳 / 6 秒。' +
        '它与裂劈完全独立：炸弹晚 2.5 秒才扔、或裂劈先打，都不影响跳数，实测 12 跳完整。' +
        '所以不需要为了"怕顶掉"而调整顺序。',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      id: 'vdh.voidfall_overwrite',
      title: '别攒虚落层：质量加速会覆盖',
      content:
        '进入恶魔变形时质量加速给 3 层虚落，若此时身上已有层数会被**覆盖**而不是叠加。' +
        '2 层时再赌两刀破裂把流星打出去、再变身，是社区验证过的处理方式；带着 3 层直接变身等于白扔。',
      source: COMMUNITY,
      confidence: 0.6,
    },
    {
      id: 'vdh.combo_damage_tradeoff',
      title: '炸弹 → 裂劈：多一颗流星，但裂劈本体掉 33–46%',
      content:
        '幽魂炸弹先吃灵魂碎片，紧随的裂劈本体从 31–34k 掉到 17–21k（实测三组）。' +
        '但整场 7 次裂劈合计只少 4.8k（碎片会回补），而多出的那颗流星约 +52.7k，' +
        '整场合计 +54,442（+7.5%/秒）。结论：连招可打，但别把"那一刀掉 45%"当成每刀都掉。',
      source: LOG_VERIFIED,
      confidence: 0.7,
    },
    {
      id: 'vdh.double_spirit_bomb',
      title: '炸弹 → 变身 → 炸弹：质量加速会重置炸弹 CD',
      content:
        '进入恶魔形态时质量加速会**重置幽魂炸弹的冷却**，所以「变身前扔一颗、变身后立刻再扔一颗」是标准手法：' +
        '两颗炸弹，且变身后那颗触发暗物质。实测该场 38 次变身中有 24 次出现「25 秒内已炸过、变身 3 秒内又炸一颗」。' +
        '不要为了「给暗物质留炸弹」而推迟变身前那颗 —— 那是把正确手法改错。',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
    {
      id: 'vdh.dark_matter_fragment_gate',
      title: '炸弹打完就变身 → 碎片为空，第二颗要等碎片',
      content:
        '双炸弹的代价是变身后手上没有碎片。实测 5 次变身时灵魂残片为 0，+2 秒才回到 1–5 层，' +
        '结果 15 秒窗口内没有第二颗炸弹，这次变身的暗物质就空转了。' +
        '这是**资源**问题而不是顺序问题：要么提前攒碎片，要么接受这次没有暗物质。',
      source: LOG_VERIFIED,
      confidence: 0.7,
    },
    {
      id: 'vdh.meteor_count_over_damage',
      title: '跨场只能比颗数，不能比单颗伤害',
      content:
        '同一套机制下，单颗流星实测 39.1k–50.0k，暗物质整段 77.0k–101.3k，' +
        '差异来自增益与暴击（烈焰烙印等）。判断机制是否触发要用**颗数/跳数**，' +
        '用伤害量会得出错误结论。',
      source: LOG_VERIFIED,
      confidence: 0.8,
    },
    {
      id: 'vdh.voidfall_stack_observability',
      title: '虚落层数在日志里不可反推（为什么 priority 为空）',
      content:
        'WCL 的虚落 buff 事件（1256322）与流星落地**同刻**成对出现，而不是在破裂叠层时；' +
        '普通 applybuff 还不带 stack 字段。因此无法从事件流还原"按键那一刻有几层"，' +
        '任何基于 buffStacks 的定责规则都会读到相位错位的状态。要用引擎自动判定，' +
        '需要先把层数改成 cast-anchored 推断（例如用破裂施放 + 已知 proc 率估算），这属下一步。',
      source: LOG_VERIFIED,
      confidence: 0.9,
    },
  ],

  sources: [LOG_VERIFIED, TALENT_TEXT, COMMUNITY, GUIDE],
};
