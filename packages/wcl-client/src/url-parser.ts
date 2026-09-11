export interface WclReportReference {
  reportCode: string;
  fightId?: number;
  source?: string;
  target?: string;
  dataType?: string;
}

const REPORT_PATH_RE = /\/reports\/([A-Za-z0-9]{1,32})/;

/**
 * Parse a Warcraft Logs report URL into its component parts.
 *
 * Supports:
 *   https://www.warcraftlogs.com/reports/ABC123
 *   https://cn.warcraftlogs.com/reports/ABC123
 *   https://www.warcraftlogs.com/reports/ABC123?fight=8
 *   https://cn.warcraftlogs.com/reports/ABC123?fight=8&type=damage-done
 */
export function parseWclUrl(url: string): WclReportReference {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new Error('WCL URL is empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid WCL URL: "${url}"`);
  }

  const match = REPORT_PATH_RE.exec(parsed.pathname);
  if (!match) {
    throw new Error(`Not a valid WCL report URL: "${url}"`);
  }

  const reportCode = match[1];
  if (!reportCode) {
    throw new Error(`Missing report code in URL: "${url}"`);
  }

  const result: WclReportReference = { reportCode };

  const fightParam = parsed.searchParams.get('fight');
  if (fightParam !== null && /^\d+$/.test(fightParam)) {
    result.fightId = Number.parseInt(fightParam, 10);
  }

  const source = parsed.searchParams.get('source');
  if (source !== null) {
    result.source = source;
  }

  const target = parsed.searchParams.get('target');
  if (target !== null) {
    result.target = target;
  }

  const dataType = parsed.searchParams.get('type');
  if (dataType !== null) {
    result.dataType = dataType;
  }

  return result;
}
