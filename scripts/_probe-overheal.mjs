/**
 * Probe: does the WCL Healing dataType expose `overheal` on raw heal rows?
 * Phase X follow-up — before plumbing overheal through DTO→normalizer→domain,
 * verify the raw field exists (and its exact shape) on a real log.
 */
import { AuthManager, GraphqlClient, RateLimitManager } from '../packages/wcl-client/dist/index.js';
import { GET_EVENTS_QUERY } from '../packages/wcl-client/dist/queries/events.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() });

const reportCode = 'YR1c6fNvbGjtVdgH';
const fightId = 1;

const data = await graphql.request({
  query: GET_EVENTS_QUERY,
  variables: {
    code: reportCode,
    startTime: 0,
    endTime: 9_999_999_999,
    dataType: 'Healing',
    fightIDs: [fightId],
    limit: 200,
  },
});
const rows = data.reportData.report?.events?.data ?? [];
console.log(`raw healing rows: ${rows.length}`);
const fieldStats = {};
for (const row of rows) {
  for (const key of Object.keys(row)) {
    fieldStats[key] = (fieldStats[key] ?? 0) + 1;
  }
}
console.log('field coverage:', JSON.stringify(fieldStats, null, 1));

// How do amount / overheal relate on heal rows?
const heals = rows.filter((r) => r.type === 'heal');
console.log(`\nheal-type rows: ${heals.length}`);
for (const h of heals.slice(0, 8)) {
  console.log(
    `  t=${h.timestamp} ability=${h.abilityGameID} amount=${r0(h.amount)} overheal=${r0(h.overheal)} hitType=${h.hitType} source=${r0(h.sourceID)} target=${r0(h.targetID)}`,
  );
}
const fullyOverhealed = heals.filter((h) => r0(h.amount) === 0 && r0(h.overheal) > 0);
console.log(`\namount=0 && overheal>0 rows: ${fullyOverhealed.length} of ${heals.length}`);
const mixed = heals.filter((h) => r0(h.amount) > 0 && r0(h.overheal) > 0);
console.log(`amount>0 && overheal>0 rows: ${mixed.length}`);

function r0(v) {
  return typeof v === 'number' ? v : JSON.stringify(v);
}
