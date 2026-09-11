import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '@wcl/shared';
import { errText, okText } from './common.js';
import {
  buildDeathReviewView,
  type AppService,
} from '@wcl/application';

const reportCodeField = z.string().describe('The WCL report code, e.g. ABC123');
const fightIdField = z
  .number()
  .int()
  .positive()
  .describe('The fight id within the report');
const playerIdField = z
  .number()
  .int()
  .positive()
  .describe('The player (actor) id');
const cooldownsField = z
  .array(
    z.object({
      abilityId: z.number().optional(),
      abilityName: z.string().optional(),
      cooldownMs: z.number().positive().describe('Cooldown in milliseconds'),
    }),
  )
  .optional()
  .describe('Ability cooldowns to evaluate for the cooldown analyzers.');

const fightPlayer = {
  reportCode: reportCodeField,
  fightId: fightIdField,
  playerId: playerIdField,
  cooldowns: cooldownsField,
};

const analysisOptions = [
  'summary',
  'rotation',
  'cooldowns',
  'buffs',
  'resources',
  'damage',
  'deaths',
] as const;

/**
 * Deterministic insight tools that expose the objective layers (combat facts,
 * spec knowledge, verdict stream) the way the audit's target architecture
 * intends: raw WCL structure never leaks through, and numbers are always
 * computed by the engine, never by the host model.
 */
export function registerInsightTools(
  server: McpServer,
  service: AppService,
): void {
  server.tool(
    'get_combat_facts',
    'Return the objective combat-facts view for a player in a fight: cast ' +
      'counts by ability, GCD/idle stats, buff uptime, resource series, ' +
      'damage totals by ability, damage targets and switches, deaths with ' +
      'pre-death damage windows, dispel / interrupt counts, and (when ' +
      'cooldowns are given) cooldown usage delays. Facts describe what ' +
      'happened and never judge it. Use this instead of raw event tools when ' +
      'the host needs "what happened" without per-event rows.',
    fightPlayer,
    async ({ reportCode, fightId, playerId, cooldowns }) => {
      try {
        const view = await service.getCombatFacts(reportCode, {
          fightId,
          playerId,
          cooldowns,
        });
        return okText(view);
      } catch (error) {
        logger.error('get_combat_facts failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'get_spec_knowledge',
    'Return the Spec Knowledge live for a player at the fight date: ' +
      'abilities / buffs / cooldowns (with spell ids), Condition→Action ' +
      'priority rules, resources and notes, plus version + patch. This is the ' +
      'theory of how the spec should be played; never edit or second-guess it, ' +
      'and never put raw knowledge into computed numbers.',
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
    },
    async ({ reportCode, fightId, playerId }) => {
      try {
        const knowledge = await service.getSpecKnowledge(reportCode, {
          fightId,
          playerId,
        });
        return okText(knowledge);
      } catch (error) {
        logger.error('get_spec_knowledge failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'analyze_fight',
    'One-shot deterministic full analysis for a player in a fight: metrics, ' +
      'severity-ordered findings with evidence, heuristic score, same-encounter ' +
      'reference baseline, plus a rotation verdict digest (five-tier ' +
      'correct/acceptable/suboptimal/mistake/unknown with knowledge version). ' +
      'Prefer over chaining get_combat_facts/get_spec_knowledge/analyze_player ' +
      'when you want the complete picture in one call. Produce coaching from ' +
      'the structured output; never recompute numbers.',
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
      cooldowns: cooldownsField,
      analysis: z
        .array(z.enum(analysisOptions))
        .optional()
        .describe('Which analysis modules to run. Defaults to all.'),
    },
    async ({ reportCode, fightId, playerId, cooldowns, analysis }) => {
      try {
        const options: {
          fightId: number;
          playerId: number;
          cooldowns?: Array<{
            abilityId?: number | undefined;
            abilityName?: string | undefined;
            cooldownMs: number;
          }>;
          include?: (
            | 'summary'
            | 'rotation'
            | 'cooldowns'
            | 'buffs'
            | 'resources'
            | 'damage'
            | 'deaths'
          )[];
        } = { fightId, playerId };
        if (cooldowns && cooldowns.length > 0) options.cooldowns = cooldowns;
        if (analysis && analysis.length > 0) options.include = [...analysis];
        const outcome = await service.analyzeFight(reportCode, options);
        return okText(outcome);
      } catch (error) {
        logger.error('analyze_fight failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'analyze_death_review',
    'Whole-fight death / wipe / add review for one fight (no player needed): ' +
      'every death with its pre-death damage window, cause classification ' +
      '(burst-kill / sustained / environment), the killing blow and top ' +
      'attackers; wipe clusters (deaths within a gap window); and add ' +
      'suspicions with confidence — who first touched a mob shortly before a ' +
      'death. All numbers are deterministic; ADD rows are clues with ' +
      'confidence, never verdicts — phrase them as 疑似/线索, do not assign ' +
      'blame without evidence.',
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      wipeGapMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Max gap between deaths that still counts as one wipe (ms). ' +
            'Defaults to 15s, or 60s for Mythic+ runs.',
        ),
    },
    async ({ reportCode, fightId, wipeGapMs }) => {
      try {
        const review = await service.analyzeDeathReview(reportCode, {
          fightId,
          ...(wipeGapMs !== undefined ? { wipeGapMs } : {}),
        });
        return okText(buildDeathReviewView(review));
      } catch (error) {
        logger.error('analyze_death_review failed', error);
        return errText(error);
      }
    },
  );
}
