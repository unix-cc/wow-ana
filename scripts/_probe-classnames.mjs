/**
 * Probe: which `className` strings does the rankings API accept?
 * (The spec→class map must match WCL's slugs exactly or the reference is
 * silently skipped — see SPEC_TO_CLASS in @wcl/application.)
 */
import { AuthManager } from '../packages/wcl-client/dist/index.js';

const auth = new AuthManager();
const token = await auth.getAccessToken();
const API = process.env.WCL_API_URL ?? 'https://cn.warcraftlogs.com/api/v2/client';

async function q(className, specName) {
  const query =
    '{ worldData { encounter(id: 61762) { characterRankings(metric: dps, className: "' +
    className +
    '", specName: "' +
    specName +
    '", page: 1) } } }';
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await res.json();
  if (j.errors) return 'ERR ' + JSON.stringify(j.errors[0]).slice(0, 140);
  const r = j.data && j.data.worldData && j.data.worldData.encounter
    ? j.data.worldData.encounter.characterRankings
    : undefined;
  const rows = (r && r.rankings) || [];
  const levels = rows.map((x) => x.hardModeLevel);
  const first = rows[0] ? rows[0].name : '-';
  return (
    'count=' + (r ? r.count : '?') +
    ' n=' + rows.length +
    ' levels=' + (levels.length ? Math.min(...levels) + '-' + Math.max(...levels) : '-') +
    ' first=' + first
  );
}

const cases = [
  ['Warrior', 'Arms'],
  ['Paladin', 'Retribution'],
  ['DeathKnight', 'Blood'],
  ['Death Knight', 'Blood'],
  ['DemonHunter', 'Havoc'],
  ['Shaman', 'Elemental'],
  ['Mage', 'Arcane'],
];
for (const c of cases) {
  console.log(c[0] + ' / ' + c[1] + ': ' + (await q(c[0], c[1])));
}
