import type { AnalysisContext, Finding } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { isMythicPlusRun } from '../../../fight-context.js';
import { downgradeForDungeon } from '../../helpers.js';
import { RETRIBUTION_PALADIN_KNOWLEDGE } from '@wcl/spec-knowledge';
import {
  avengingWrathDelayRule,
  executionSentenceDelayRule,
  wakeOfAshesDelayRule,
  gcdIdleRule,
} from './rules/index.js';

const RULES = [
  avengingWrathDelayRule,
  executionSentenceDelayRule,
  wakeOfAshesDelayRule,
  gcdIdleRule,
];

// In Mythic+ a zero-cast cooldown finding is ambiguous (talent not taken vs
// available-but-unused), and Radiant Glory removes Avenging Wrath as an
// active button entirely. Downgrade all three zero-cast findings so they
// read as hints, not accusations.
const M_PLUS_ZERO_CAST_RULE_IDS = [
  'retribution_paladin.avenging_wrath_delay',
  'retribution_paladin.execution_sentence_delay',
  'retribution_paladin.wake_of_ashes_delay',
] as const;

function adjustForDungeon(findings: Finding[]): Finding[] {
  let result = findings;
  for (const ruleId of M_PLUS_ZERO_CAST_RULE_IDS) {
    result = downgradeForDungeon(result, ruleId, {
      description:
        '（大秘境场景无法区分「未选择天赋」与「可用而未用」；若点出辐耀荣光，复仇之怒由灰烬觉醒自动触发，本条可忽略。）',
      recommendation: '（若天赋构型不含该技能请忽略本条。）',
    });
  }
  return result;
}

/**
 * Retribution Paladin specialization analyzer.
 */
export class RetributionPaladinAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Retribution Paladin';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const findings = RULES.flatMap((rule) => rule.evaluate(context));
    return {
      spec: this.getSpec(),
      metrics: {
        ruleIds: RULES.map((rule) => rule.id),
        knowledgeVersion: RETRIBUTION_PALADIN_KNOWLEDGE.knowledgeVersion,
        knowledgePatch: RETRIBUTION_PALADIN_KNOWLEDGE.patch,
        knowledgePriority: RETRIBUTION_PALADIN_KNOWLEDGE.priority.map(
          (rule) => rule.id,
        ),
      },
      findings: isMythicPlusRun(context.report, context.fight)
        ? adjustForDungeon(findings)
        : findings,
    };
  }
}
