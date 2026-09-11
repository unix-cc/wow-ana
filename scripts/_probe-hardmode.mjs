/**
 * Probe 6: introspect HardModeLevelRankFilter + LeaderboardRank, and test
 * whether hardModeLevel gives an explicit key-level cohort.
 */
import { AuthManager } from '../packages/wcl-client/dist/index.js';

const API_URL = process.env.WCL_API_URL ?? 'https://cn.warcraftlogs.com/api/v2/client';
const auth = new AuthManager();

async function gql(query, variables) {
  const token = await auth.getAccessToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) console.log('  errors:', JSON.stringify(json.errors).slice(0, 500));
  return json.data;
}

for (const name of ['HardModeLevelRankFilter', 'LeaderboardRank', 'CharacterRankingMetricType']) {
  const d = await gql(`{ __type(name: "${name}") { kind enumValues { name } } }`, {});
  const t = d?.__type;
  console.log(`[${name}] kind=${t?.kind} values=${(t?.enumValues ?? []).map((v) => v.name).join(', ')}`);
}

const tries = [
  'MIN_20',
  'MIN_15',
  'MAX_20',
  'DEFAULT',
];
for (const v of tries) {
  const d = await gql(
    `{ worldData { encounter(id: 61762) { characterRankings(metric: dps, className: "Shaman", specName: "Elemental", page: 1, hardModeLevel: ${v}) } } }`,
    {},
  );
  const ranks = d?.worldData?.encounter?.characterRankings;
  const levels = (ranks?.rankings ?? []).map((r) => r.hardModeLevel);
  console.log(
    `[hardModeLevel=${v}] count=${ranks?.count} n=${levels.length} levels=${levels.slice(0, 6).join(',')} range=${levels.length ? `${Math.min(...levels)}-${Math.max(...levels)}` : '-'}`,
  );
}
