import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from '@wcl/shared';
import { MAX_RAW_EVENT_LIMIT } from '@wcl/application';
import { errText, okText } from './common.js';
import type { AppService } from '@wcl/application';

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

/**
 * Raw events are bounded exports for progressive disclosure — never a full
 * fight dump. `limit` (default 500, hard max 500) caps each response; hosts
 * needing a deeper "what happened" picture should prefer `get_combat_facts`.
 */
const eventLimitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_RAW_EVENT_LIMIT)
  .optional()
  .describe(
    `Max events to return (default ${MAX_RAW_EVENT_LIMIT}, hard cap ${MAX_RAW_EVENT_LIMIT})`,
  );

/**
 * Register player-query tools. These return raw (but bounded) event subsets
 * for progressive disclosure; they do not run analysis.
 */
export function registerPlayerTools(
  server: McpServer,
  service: AppService,
): void {
  server.tool(
    'get_players',
    'List all player actors that participated in a fight.',
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
    },
    async ({ reportCode, fightId }) => {
      try {
        const players = await service.getPlayers(reportCode, fightId);
        return okText(players);
      } catch (error) {
        logger.error('get_players failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'get_player_summary',
    'Get a single player summary: id, name, spec and actor type.',
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
    },
    async ({ reportCode, fightId, playerId }) => {
      try {
        const summary = await service.getPlayerSummary(
          reportCode,
          fightId,
          playerId,
        );
        if (!summary) {
          return errText(
            new Error(`Player ${playerId} not found in fight ${fightId}.`),
          );
        }
        return okText(summary);
      } catch (error) {
        logger.error('get_player_summary failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'get_player_casts',
    "Return a player's cast events for a fight (capped). Use when investigating rotation details.",
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
      limit: eventLimitField,
    },
    async ({ reportCode, fightId, playerId, limit }) => {
      try {
        const events = await service.getPlayerCasts(
          reportCode,
          fightId,
          playerId,
          { limit },
        );
        return okText(events);
      } catch (error) {
        logger.error('get_player_casts failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'get_player_buffs',
    "Return a player's buff/debuff events for a fight (capped).",
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
      limit: eventLimitField,
    },
    async ({ reportCode, fightId, playerId, limit }) => {
      try {
        const events = await service.getPlayerBuffs(
          reportCode,
          fightId,
          playerId,
          { limit },
        );
        return okText(events);
      } catch (error) {
        logger.error('get_player_buffs failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'get_player_damage',
    "Return a player's damage-done events for a fight (capped).",
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
      limit: eventLimitField,
    },
    async ({ reportCode, fightId, playerId, limit }) => {
      try {
        const events = await service.getPlayerDamage(
          reportCode,
          fightId,
          playerId,
          { limit },
        );
        return okText(events);
      } catch (error) {
        logger.error('get_player_damage failed', error);
        return errText(error);
      }
    },
  );

  server.tool(
    'get_player_deaths',
    "Return a player's death events for a fight (capped).",
    {
      reportCode: reportCodeField,
      fightId: fightIdField,
      playerId: playerIdField,
      limit: eventLimitField,
    },
    async ({ reportCode, fightId, playerId, limit }) => {
      try {
        const events = await service.getPlayerDeaths(
          reportCode,
          fightId,
          playerId,
          { limit },
        );
        return okText(events);
      } catch (error) {
        logger.error('get_player_deaths failed', error);
        return errText(error);
      }
    },
  );
}
