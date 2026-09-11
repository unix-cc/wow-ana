/**
 * Probe: can the WCL API return localized (zh-CN) ability names?
 *
 * Two questions, both verified against the live API:
 *  1. Does an event row carry an ability name at all, and in which language?
 *  2. Does a locale signal (Accept-Language header / `translate` arg) change it?
 *
 * Also dumps one characterRankings row so we can build a correct external link.
 */
import { AuthManager } from '../packages/wcl-client/dist/index.js';
import { GET_EVENTS_QUERY } from '../packages/wcl-client/dist/queries/events.js';
import { GET_ENCOUNTER_RANKINGS_QUERY } from '../packages/wcl-client/dist/queries/rankings.js';

const API_URL = process.env.WCL_API_URL ?? 'https://cn.warcraftlogs.com/api/v2/client';
const auth = new AuthManager();

async function gql(query, variables, headers = {}) {
  const token = await auth.getAccessToken();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) console.log('  errors:', JSON.stringify(json.errors).slice(0, 300));
  return json.data;
}

const code = 'fXdMjWKJbpna6yHv';
const fightId = 13;

async function dumpEvents(label, headers) {
  const data = await gql(
    GET_EVENTS_QUERY,
    {
      code,
      startTime: 0,
      endTime: 9_999_999_999,
      dataType: 'Casts',
      fightIDs: [fightId],
      limit: 8,
    },
    headers,
  );
  const rows = data?.reportData?.report?.events?.data ?? [];
  console.log(`\n[${label}] rows=${rows.length}`);
  for (const row of rows.slice(0, 5)) {
    console.log(
      `  abilityGameID=${row.abilityGameID} ability=${JSON.stringify(row.ability)} ${row.sourceName ?? ''} -> ${row.targetName ?? ''}`,
    );
  }
  console.log('  row keys:', Object.keys(rows[0] ?? {}).join(','));
}

await dumpEvents('default (no locale header)', {});
await dumpEvents('Accept-Language: zh-CN', { 'Accept-Language': 'zh-CN' });

// Rankings row shape + whether the page URL can be reconstructed.
const className = 'Shaman';
const specName = 'Elemental';
const r = await gql(
  GET_ENCOUNTER_RANKINGS_QUERY,
  {
    encounterID: 1184,
    className,
    specName,
    metric: 'dps',
    page: 1,
  },
);
const enc = r?.worldData?.encounter;
console.log('\n[rankings] encounter:', enc?.name);
const first = enc?.characterRankings?.rankings?.[0];
console.log('  first row:', JSON.stringify(first));
console.log('  count:', enc?.characterRankings?.rankings?.length);
