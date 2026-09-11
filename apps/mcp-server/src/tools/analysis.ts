import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '@wcl/shared';
import { errText, okText } from './common.js';
import type { AppService } from '@wcl/application';

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
 * Register the analyze_player tool. This is the primary entry point for a
 * complete deterministic combat analysis of a single player.
 */
export function registerAnalysisTools(
  server: McpServer,
  service: AppService,
): void {
  server.tool(
    'analyze_player',
    'Run a deterministic combat analysis for a specific player in a fight. ' +
      'Returns structured metrics, findings (severity-ordered) with evidence, ' +
      'and a heuristic overall score. Preferred when the user asks for a full ' +
      'performance analysis. It does not generate natural-language coaching; ' +
      'produce the coaching from the structured output instead.',
    {
      reportCode: z.string().describe('The WCL report code, e.g. ABC123'),
      fightId: z.number().int().positive().describe('The fight id'),
      playerId: z.number().int().positive().describe('The player (actor) id'),
      analysis: z
        .array(z.enum(analysisOptions))
        .optional()
        .describe('Which analysis modules to run. Defaults to all.'),
      cooldowns: z
        .array(
          z.object({
            abilityId: z.number().optional(),
            abilityName: z.string().optional(),
            cooldownMs: z
              .number()
              .positive()
              .describe('Cooldown in milliseconds'),
          }),
        )
        .optional()
        .describe('Ability cooldowns to evaluate for the cooldown analyzer.'),
    },
    async ({ reportCode, fightId, playerId, analysis, cooldowns }) => {
      try {
        const options: {
          fightId: number;
          playerId: number;
          include?: (
            | 'summary'
            | 'rotation'
            | 'cooldowns'
            | 'buffs'
            | 'resources'
            | 'damage'
            | 'deaths'
          )[];
          cooldowns?: Array<{
            abilityId?: number | undefined;
            abilityName?: string | undefined;
            cooldownMs: number;
          }>;
        } = { fightId, playerId };
        if (analysis && analysis.length > 0) {
          options.include = [...analysis];
        }
        if (cooldowns && cooldowns.length > 0) {
          options.cooldowns = cooldowns;
        }

        const { summary, result } = await service.analyzePlayer(
          reportCode,
          options,
        );
        return okText({ summary, result });
      } catch (error) {
        logger.error('analyze_player failed', error);
        return errText(error);
      }
    },
  );
}
