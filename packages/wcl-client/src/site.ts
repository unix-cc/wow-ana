import { config } from '@wcl/shared';

/**
 * Web links for the configured Warcraft Logs host.
 *
 * Analyses are meant to be **verifiable**, not just readable: every reference
 * claim the AI makes should end in a link the player can open. The API URL and
 * the site share a host (`cn.warcraftlogs.com/api/v2/client` →
 * `cn.warcraftlogs.com`), so the origin is derived from `WCL_API_URL` rather
 * than hardcoded — a deployment pointed at the global site links there.
 */

/** Origin of the Warcraft Logs website for the configured API host. */
export function wclSiteOrigin(apiUrl: string = config.wclApiUrl): string {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'https://www.warcraftlogs.com';
  }
}

/** Permalink to a report, optionally focused on one fight. */
export function buildReportUrl(
  code: string,
  fightId?: number | undefined,
  origin: string = wclSiteOrigin(),
): string {
  return fightId === undefined
    ? `${origin}/reports/${code}`
    : `${origin}/reports/${code}#fight=${fightId}`;
}

/**
 * Link to the encounter's rankings page, pre-filtered to the class and spec.
 *
 * The zone id is required: rankings are zone-scoped, and a Mythic+ dungeon is
 * addressed by `#dungeon=` while a raid boss uses `#boss=`. The hash filters
 * are best-effort (WCL owns them); the base path always lands on the correct
 * zone's rankings, so a changed filter name degrades to a working page rather
 * than a 404.
 */
export function buildRankingsUrl(params: {
  zoneId: number;
  encounterId: number;
  className?: string | undefined;
  specName?: string | undefined;
  /** True for a Mythic+ dungeon run (`#dungeon=`), false for a raid boss. */
  dungeon?: boolean | undefined;
  origin?: string | undefined;
}): string {
  const origin = params.origin ?? wclSiteOrigin();
  const filters = [
    params.dungeon === true
      ? `dungeon=${params.encounterId}`
      : `boss=${params.encounterId}`,
  ];
  if (params.className) filters.push(`class=${encodeURIComponent(params.className)}`);
  if (params.specName) filters.push(`spec=${encodeURIComponent(params.specName)}`);
  return `${origin}/zone/rankings/${params.zoneId}#${filters.join('&')}`;
}
