import type { AnalysisContext } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { BEAST_MASTERY_KNOWLEDGE } from '@wcl/spec-knowledge';
import { BM_COOLDOWNS } from './constants.js';
import { killCommandUsageRule } from './rules/kill-command.js';
import { barbedShotUptimeRule } from './rules/barbed-shot-uptime.js';
import { beastCleaveUptimeRule } from './rules/beast-cleave-uptime.js';
import { cooldownDelayRule } from './rules/cooldown-delay.js';
import { gcdIdleRule } from './rules/gcd-idle.js';

const RULES = [
  killCommandUsageRule,
  barbedShotUptimeRule,
  beastCleaveUptimeRule,
  cooldownDelayRule,
  gcdIdleRule,
];

/**
 * Beast Mastery Hunter specialization analyzer. Runs the deterministic
 * BM-specific rules against a player's fight data and returns findings.
 */
export class BeastMasteryAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Beast Mastery Hunter';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const findings = RULES.flatMap((rule) => rule.evaluate(context));
    return {
      spec: this.getSpec(),
      metrics: {
        bmCooldowns: BM_COOLDOWNS,
        ruleIds: RULES.map((rule) => rule.id),
        knowledgeVersion: BEAST_MASTERY_KNOWLEDGE.knowledgeVersion,
        knowledgePatch: BEAST_MASTERY_KNOWLEDGE.patch,
        knowledgePriority: BEAST_MASTERY_KNOWLEDGE.priority.map(
          (rule) => rule.id,
        ),
      },
      findings,
    };
  }
}
