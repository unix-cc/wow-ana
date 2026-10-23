import type { AnalysisContext } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { VENGEANCE_DEMON_HUNTER_KNOWLEDGE } from '@wcl/spec-knowledge';
import { collectMeteorVolleys, isOverkillClamped, summarizeVolleys } from './meteors.js';
import { darkMatterMissingRule } from './rules/dark-matter-missing.js';

const RULES = [darkMatterMissingRule];

const knowledge = VENGEANCE_DEMON_HUNTER_KNOWLEDGE;

function idOf(key: string): number | undefined {
  return knowledge.abilities.find((ability) => ability.key === key)?.abilityId;
}

const METEOR_ID = idOf('voidfall_meteor');
const WORLD_KILLER_ID = idOf('world_killer');
const SHOWER_ID = idOf('dark_matter');

/**
 * Vengeance Demon Hunter specialization analyzer.
 *
 * 这一层只做**可观测**的事：把迅疾流星按「串」还原，统计每串颗数（= 消耗的层数）、
 * 伤害与暗物质跳数。颗数按「同一时刻同一目标」去重，AoE 的多目标命中不会虚增层数。刻意不做「层数够不够 3 层」的判定 —— 虚落 buff 事件在 WCL 里
 * 与流星落地同刻出现，按键层面的层数不可还原（见 knowledge 的
 * `vdh.voidfall_stack_observability` 与 `priority` 为空的原因）。
 */
export class VengeanceDemonHunterAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Vengeance Demon Hunter';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const { player, events, fight } = context;
    const findings = RULES.flatMap((rule) => rule.evaluate(context));

    // 数据质量：假人/目标濒死的日志整场 amount 被钳成 1，伤害合计没有比较价值。
    const damageRows = events.filter(
      (event) => event.type === 'damage' && event.sourceId === player.id,
    );
    const clampedShare =
      damageRows.length === 0
        ? 0
        : damageRows.filter(isOverkillClamped).length / damageRows.length;

    const metrics: Record<string, unknown> = {
      knowledgeVersion: knowledge.knowledgeVersion,
      knowledgePatch: knowledge.patch,
      ruleIds: RULES.map((rule) => rule.id),
      dataQuality: {
        // true 时（>30% 的伤害行被 overkill 钳制）不要拿 damage 字段做跨场比较。
        overkillClamped: clampedShare > 0.3,
        clampedShare: Math.round(clampedShare * 1000) / 1000,
      },
    };

    if (METEOR_ID !== undefined && WORLD_KILLER_ID !== undefined) {
      const volleys = collectMeteorVolleys(events, player.id, {
        meteor: METEOR_ID,
        worldKiller: WORLD_KILLER_ID,
      });
      const summary = summarizeVolleys(volleys);
      metrics['meteors'] = {
        ...summary,
        // 只保留前 20 串，避免把整场明细塞进 metrics
        detail: volleys.slice(0, 20).map((volley) => ({
          at: Math.round(((volley.startTime - fight.startTime) / 1000) * 10) / 10,
          impacts: volley.impacts,
          targets: volley.targets,
          damage: volley.damage,
        })),
      };
    }

    if (SHOWER_ID !== undefined) {
      const ticks = events.filter(
        (event) =>
          event.type === 'damage' &&
          event.sourceId === player.id &&
          event.abilityId === SHOWER_ID,
      );
      metrics['darkMatter'] = {
        ticks: ticks.length,
        damage: ticks.reduce((sum, event) => sum + (event.amount ?? 0), 0),
      };
    }

    return { spec: this.getSpec(), metrics, findings };
  }
}
