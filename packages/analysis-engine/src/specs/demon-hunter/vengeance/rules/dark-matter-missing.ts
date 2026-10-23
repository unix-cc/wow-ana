import type { Finding } from '@wcl/domain';
import type { SpecRule } from '../../../types.js';
import { VENGEANCE_DEMON_HUNTER_KNOWLEDGE } from '@wcl/spec-knowledge';

/**
 * 暗物质漏结算检测。
 *
 * 规则只针对**无可争议**的情形：变身后确实扔出了第一颗幽魂炸弹，
 * 但该炸弹之后 6 秒内一条流星雨伤害事件都没有。
 *
 * 刻意不做的事：
 * - 不判断「变身后该不该立刻扔炸弹」——碎片不够时留炸弹是正确选择；
 * - 不把「炸弹打得晚」算失误——那是资源决策。
 *
 * 只报告「炸弹打了、流星雨没出现」，这是机制层面的缺失（游戏 bug 或日志缺行），
 * 与玩家操作无关，因此不产出 verdict、不给 recommendation 施压。
 */

const META_TO_BOMB_WINDOW_MS = 15_000;
const SHOWER_WINDOW_MS = 7_000;
const SHOWER_EXPECTED_TICKS = 12;

const knowledge = VENGEANCE_DEMON_HUNTER_KNOWLEDGE;

function idOf(key: string): number | undefined {
  return knowledge.abilities.find((ability) => ability.key === key)?.abilityId;
}

const META_ID = knowledge.cooldowns.find((cd) => cd.key === 'metamorphosis')?.abilityId;
const BOMB_ID = idOf('spirit_bomb');
const SHOWER_ID = idOf('dark_matter');

export const darkMatterMissingRule: SpecRule = {
  id: 'vdh.dark_matter_missing',
  name: 'Dark Matter settlement',
  description:
    'Dark Matter should fire a 12-tick shadowflame shower after the first Spirit Bomb of a Metamorphosis.',
  evaluate(context): Finding[] {
    if (META_ID === undefined || BOMB_ID === undefined || SHOWER_ID === undefined) {
      return [];
    }
    const { player, fight, events } = context;
    const mine = events.filter((event) => event.sourceId === player.id);

    const metas = mine
      .filter((event) => event.type === 'cast' && event.abilityId === META_ID)
      .map((event) => event.timestamp)
      .sort((a, b) => a - b);
    if (metas.length === 0) return [];

    const bombs = mine
      .filter((event) => event.type === 'cast' && event.abilityId === BOMB_ID)
      .map((event) => event.timestamp)
      .sort((a, b) => a - b);
    if (bombs.length === 0) return [];

    const showers = mine
      .filter((event) => event.type === 'damage' && event.abilityId === SHOWER_ID)
      .map((event) => event.timestamp);

    const missing: Array<{ metaAt: number; bombAt: number; ticks: number }> = [];
    let checked = 0;
    for (const metaAt of metas) {
      // 该次变身里的第一颗炸弹
      const bombAt = bombs.find(
        (timestamp) => timestamp >= metaAt && timestamp <= metaAt + META_TO_BOMB_WINDOW_MS,
      );
      if (bombAt === undefined) continue; // 没扔炸弹：不是本规则的判定范围
      checked += 1;
      const ticks = showers.filter(
        (timestamp) => timestamp >= bombAt && timestamp <= bombAt + SHOWER_WINDOW_MS,
      ).length;
      if (ticks === 0) missing.push({ metaAt, bombAt, ticks });
    }

    if (missing.length === 0) return [];
    const first = missing[0] as { metaAt: number; bombAt: number; ticks: number };
    const rel = (timestamp: number): string =>
      ((timestamp - fight.startTime) / 1000).toFixed(1);

    return [
      {
        id: 'vdh.dark_matter_missing',
        category: 'damage',
        severity: 'low',
        title: '暗物质未结算（变身后首颗炸弹没有流星雨）',
        description:
          `本场 ${checked} 次「变身后首颗炸弹」中，有 ${missing.length} 次在 6 秒内没有任何流星雨伤害事件；` +
          `首次出现在变身 @${rel(first.metaAt)}s、炸弹 @${rel(first.bombAt)}s。` +
          `按天赋应产生 ${SHOWER_EXPECTED_TICKS} 跳暗影烈焰伤害。`,
        timestamp: first.bombAt,
        confidence: 0.9,
        expected: { ticks: SHOWER_EXPECTED_TICKS, windowMs: SHOWER_WINDOW_MS },
        actual: { ticks: 0, occurrences: missing.length, checked },
        evidence: [
          {
            timestamp: first.metaAt,
            abilityId: META_ID,
            ability: '恶魔变形',
            note: '进入恶魔形态',
            fightId: fight.id,
          },
          {
            timestamp: first.bombAt,
            abilityId: BOMB_ID,
            ability: '幽魂炸弹',
            note: '变身后的第一颗炸弹',
            fightId: fight.id,
          },
          {
            timestamp: first.bombAt,
            abilityId: SHOWER_ID,
            ability: '暗物质（流星雨）',
            value: 0,
            unit: 'ticks',
            note: '炸弹后 6 秒内没有任何流星雨伤害事件',
            fightId: fight.id,
          },
        ],
        recommendation:
          '这是机制层面的缺失而非操作问题：同一份日志里其它变身窗口若正常，说明是偶发。' +
          '若每次都为空，先确认日志是否完整，再考虑按 bug 上报。',
      },
    ];
  },
};
