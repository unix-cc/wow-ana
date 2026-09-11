/**
 * Probe 5: (a) does encounter.characterRankings accept a key-level / bracket
 * filter (the long-standing "can't filter M+ by level" limitation)?
 *          (b) what does zone(id) expose, so external links can be built?
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
  if (json.errors) console.log('  errors:', JSON.stringify(json.errors).slice(0, 600));
  return json.data;
}

const t = await gql(
  `{ __type(name: "Encounter") { fields { name args { name type { name kind ofType { name kind enumValues { name } } } } } } }`,
  {},
);
console.log('[Encounter fields]');
for (const f of t?.__type?.fields ?? []) {
  const args = (f.args ?? [])
    .map((a) => {
      const tn = a.type?.name ?? a.type?.ofType?.name ?? a.type?.kind;
      const en = (a.type?.ofType?.enumValues ?? a.type?.enumValues ?? []).map((e) => e.name);
      return `${a.name}:${tn}${en.length ? `{${en.join('|')}}` : ''}`;
    })
    .join(', ');
  console.log(`  ${f.name}(${args})`);
}

// Try a bracket/key-level filter on the M+ encounter rankings.
const attempts = [
  ['baseline', `characterRankings(metric: dps, className: "Shaman", specName: "Elemental", page: 1)`],
  ['byBracket', `characterRankings(metric: dps, className: "Shaman", specName: "Elemental", page: 1, byBracket: true)`],
  ['bracket:21', `characterRankings(metric: dps, className: "Shaman", specName: "Elemental", page: 1, bracket: 21)`],
  ['difficulty:21', `characterRankings(metric: dps, className: "Shaman", specName: "Elemental", page: 1, difficulty: 21)`],
  ['partition:-1', `characterRankings(metric: dps, className: "Shaman", specName: "Elemental", page: 1, partition: -1)`],
];
for (const [label, sel] of attempts) {
  const d = await gql(`{ worldData { encounter(id: 61762) { name ${sel} } } }`, {});
  const ranks = d?.worldData?.encounter?.characterRankings;
  const levels = (ranks?.rankings ?? []).map((r) => r.hardModeLevel);
  console.log(
    `[${label}] count=${ranks?.count} levels=${levels.slice(0, 8).join(',')} min=${Math.min(...levels)} max=${Math.max(...levels)}`,
  );
}

// Zone encounters (for building a dungeon link).
const z = await gql(
  `{ worldData { zone(id: 55) { id name encounters { id name } } } }`,
  {},
);
console.log('\n[zone 55]', z?.worldData?.zone?.name, 'encounters:', (z?.worldData?.zone?.encounters ?? []).map((e) => `${e.id}:${e.name}`).join(' | ').slice(0, 400));
