import type { AnalysisContext } from '@wcl/domain';
import type { SpecAnalyzer, SpecAnalysisResult } from '../../types.js';
import { isMythicPlusRun } from '../../../fight-context.js';
import { BLOOD_DEATH_KNIGHT_KNOWLEDGE } from '@wcl/spec-knowledge';
import { boneShieldUptimeRule } from './rules/bone-shield-uptime.js';
import { vampiricBloodDelayRule } from './rules/vampiric-blood-delay.js';
import { dancingRuneWeaponDelayRule } from './rules/dancing-rune-weapon-delay.js';
import { gcdIdleRule } from './rules/gcd-idle.js';

const RULES = [
  boneShieldUptimeRule,
  vampiricBloodDelayRule,
  dancingRuneWeaponDelayRule,
  gcdIdleRule,
];

// In a Mythic+ run the whole dungeon is one fight: defensive cooldowns are
// pressed pull-by-pull against danger patterns, so the n*cooldown slot model
// produces meaningless "delay" numbers (real log fXdMjWKJbpna6yHv: DRW avg
// "delay" 30s on a tank who pressed it 15 times). Same verdict as the Phase M
// single-target gates: the model stays silent outside its domain.
const M_PLUS_SKIPPED_RULE_IDS = new Set([
  'blood_dk.vampiric_blood_delay',
  'blood_dk.dancing_rune_weapon_delay',
]);

/**
 * Blood Death Knight specialization analyzer.
 */
export class BloodDeathKnightAnalyzer implements SpecAnalyzer {
  getSpec(): string {
    return 'Blood Death Knight';
  }

  analyze(context: AnalysisContext): SpecAnalysisResult {
    const skipDefensiveDelays = isMythicPlusRun(context.report, context.fight);
    const rules = skipDefensiveDelays
      ? RULES.filter((rule) => !M_PLUS_SKIPPED_RULE_IDS.has(rule.id))
      : RULES;
    const findings = rules.flatMap((rule) => rule.evaluate(context));
    return {
      spec: this.getSpec(),
      metrics: {
        ruleIds: rules.map((rule) => rule.id),
        knowledgeVersion: BLOOD_DEATH_KNIGHT_KNOWLEDGE.knowledgeVersion,
        knowledgePatch: BLOOD_DEATH_KNIGHT_KNOWLEDGE.patch,
        knowledgePriority: BLOOD_DEATH_KNIGHT_KNOWLEDGE.priority.map(
          (rule) => rule.id,
        ),
      },
      findings,
    };
  }
}
