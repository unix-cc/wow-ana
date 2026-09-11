import type { AnalysisContext, Finding } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { isMythicPlusRun } from '../../../fight-context.js';
import { downgradeForDungeon } from '../../helpers.js';
import { ARCANE_MAGE_KNOWLEDGE } from '@wcl/spec-knowledge';
import { clearcastingWasteRule } from './rules/clearcasting-waste.js';
import { arcaneChargesOverflowRule } from './rules/arcane-charges-overflow.js';
import { arcaneSurgeDelayRule } from './rules/arcane-surge-delay.js';
import { gcdIdleRule } from './rules/gcd-idle.js';

const RULES = [
  clearcastingWasteRule,
  arcaneChargesOverflowRule,
  arcaneSurgeDelayRule,
  gcdIdleRule,
];

const ARCANE_SURGE_RULE_ID = 'arcane_mage.arcane_surge_delay';

/**
 * In a Mythic+ run the whole dungeon is one fight. A "never used your burst"
 * finding computed from fixed-cooldown slots is ambiguous there: cooldowns are
 * aligned to big pulls rather than pressed on cooldown, and the theoretical
 * use count over the whole-run duration overstates intent. Downgrade that one
 * finding so it reads as a hint, not an accusation (mirrors the Elemental
 * Shaman analyzer); the GCD-idle rule already skips itself in Mythic+.
 */
function adjustForDungeon(findings: Finding[]): Finding[] {
  return downgradeForDungeon(findings, ARCANE_SURGE_RULE_ID, {
    description:
      '（大秘境整本战斗的时间轴不按固定冷却建模，理论可用次数仅作参考；爆发通常随高压波次对齐。若已在关键波次开涌动，本条可忽略。）',
    recommendation: '（爆发应随高压波次对齐，不必严格卡冷却。）',
  });
}

/**
 * Arcane Mage specialization analyzer.
 */
export class ArcaneMageAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Arcane Mage';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const findings = RULES.flatMap((rule) => rule.evaluate(context));
    return {
      spec: this.getSpec(),
      metrics: {
        ruleIds: RULES.map((rule) => rule.id),
        knowledgeVersion: ARCANE_MAGE_KNOWLEDGE.knowledgeVersion,
        knowledgePatch: ARCANE_MAGE_KNOWLEDGE.patch,
        knowledgePriority: ARCANE_MAGE_KNOWLEDGE.priority.map(
          (rule) => rule.id,
        ),
      },
      findings: isMythicPlusRun(context.report, context.fight)
        ? adjustForDungeon(findings)
        : findings,
    };
  }
}
