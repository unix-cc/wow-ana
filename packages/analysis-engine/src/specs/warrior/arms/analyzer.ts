import type { AnalysisContext, Finding } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { isMythicPlusRun } from '../../../fight-context.js';
import { downgradeForDungeon } from '../../helpers.js';
import { ARMS_WARRIOR_KNOWLEDGE } from '@wcl/spec-knowledge';
import {
  colossusSmashDelayRule,
  avatarDelayRule,
  bladestormDelayRule,
  gcdIdleRule,
} from './rules/index.js';

const RULES = [
  colossusSmashDelayRule,
  avatarDelayRule,
  bladestormDelayRule,
  gcdIdleRule,
];

// In Mythic+ a zero-cast cooldown finding is ambiguous (talent not taken vs
// available-but-unused): Avatar / Bladestorm (Slayer hero talent) are all
// optional buttons. Downgrade those zero-cast findings to hints.
// Colossus Smash is mandatory in every Arms build, so its zero-cast finding
// keeps its severity even in a dungeon.
const M_PLUS_ZERO_CAST_RULE_IDS = [
  'arms_warrior.avatar_delay',
  'arms_warrior.bladestorm_delay',
] as const;

function adjustForDungeon(findings: Finding[]): Finding[] {
  let result = findings;
  for (const ruleId of M_PLUS_ZERO_CAST_RULE_IDS) {
    result = downgradeForDungeon(result, ruleId, {
      description:
        '（大秘境场景无法区分「未选择天赋/英雄天赋」与「可用而未用」。）',
      recommendation: '（若天赋构型不含该技能请忽略本条。）',
    });
  }
  return result;
}

/**
 * Arms Warrior specialization analyzer.
 */
export class ArmsWarriorAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Arms Warrior';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const findings = RULES.flatMap((rule) => rule.evaluate(context));
    return {
      spec: this.getSpec(),
      metrics: {
        ruleIds: RULES.map((rule) => rule.id),
        knowledgeVersion: ARMS_WARRIOR_KNOWLEDGE.knowledgeVersion,
        knowledgePatch: ARMS_WARRIOR_KNOWLEDGE.patch,
        knowledgePriority: ARMS_WARRIOR_KNOWLEDGE.priority.map(
          (rule) => rule.id,
        ),
      },
      findings: isMythicPlusRun(context.report, context.fight)
        ? adjustForDungeon(findings)
        : findings,
    };
  }
}
