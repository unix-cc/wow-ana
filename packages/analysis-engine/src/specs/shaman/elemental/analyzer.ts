import type { AnalysisContext, Finding } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { isMythicPlusRun } from '../../../fight-context.js';
import { downgradeForDungeon } from '../../helpers.js';
import { ELEMENTAL_SHAMAN_KNOWLEDGE } from '@wcl/spec-knowledge';
import { flameShockUptimeRule } from './rules/flame-shock-uptime.js';
import { lavaSurgeWasteRule } from './rules/lava-surge-waste.js';
import { stormkeeperDelayRule } from './rules/stormkeeper-delay.js';
import { fireElementalDelayRule } from './rules/fire-elemental-delay.js';
import { gcdIdleRule } from './rules/gcd-idle.js';

const RULES = [
  flameShockUptimeRule,
  lavaSurgeWasteRule,
  stormkeeperDelayRule,
  fireElementalDelayRule,
  gcdIdleRule,
];

const FIRE_ELEMENTAL_RULE_ID = 'elemental_shaman.fire_elemental_delay';

/**
 * In a Mythic+ run a zero-cast big-cooldown finding is ambiguous: the build
 * may simply not take the talent, which events cannot tell apart from "had
 * it and never used it". Downgrade that one finding so it reads as a hint,
 * not an accusation, and let the Flame Shock / GCD idle rules skip
 * themselves (their single-target / cast-gap models do not apply to a
 * whole-dungeon fight).
 */
function adjustForDungeon(findings: Finding[]): Finding[] {
  return downgradeForDungeon(findings, FIRE_ELEMENTAL_RULE_ID, {
    description:
      '（大秘境场景无法区分「未选择天赋」与「可用而未用」；若天赋未点出火焰元素，本条可忽略。）',
    recommendation: '（若天赋未点出火焰元素请忽略本条。）',
  });
}

/**
 * Elemental Shaman specialization analyzer.
 */
export class ElementalShamanAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Elemental Shaman';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const findings = RULES.flatMap((rule) => rule.evaluate(context));
    return {
      spec: this.getSpec(),
      metrics: {
        ruleIds: RULES.map((rule) => rule.id),
        knowledgeVersion: ELEMENTAL_SHAMAN_KNOWLEDGE.knowledgeVersion,
        knowledgePatch: ELEMENTAL_SHAMAN_KNOWLEDGE.patch,
        knowledgePriority: ELEMENTAL_SHAMAN_KNOWLEDGE.priority.map(
          (rule) => rule.id,
        ),
      },
      findings: isMythicPlusRun(context.report, context.fight)
        ? adjustForDungeon(findings)
        : findings,
    };
  }
}
