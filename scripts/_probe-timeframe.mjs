/**
 * Probe: which time frame are WCL event timestamps in, and which frame is
 * fight.startTime? Report-relative vs epoch decides how the knowledge
 * registry must resolve fight dates, and whether the cooldown-delay slot
 * math is sound.
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() });
const client = new WclClient({ graphql });

const reportCode = 'fXdMjWKJbpna6yHv';
const fightId = 13;
const playerId = 1573; // arms warrior

const [report, fights] = await Promise.all([
  client.getReport(reportCode),
  client.getFights(reportCode),
]);
const fight = fights.find((f) => f.id === fightId);
console.log('report.startTime =', report.startTime, '->', new Date(report.startTime).toISOString());
console.log('fight 13 startTime =', fight?.startTime, 'endTime =', fight?.endTime,
  'duration =', (fight?.endTime ?? 0) - (fight?.startTime ?? 0), 'ms');

const events = await client.getEvents({
  reportCode, fightId, dataType: 'Casts', sourceId: playerId,
});
console.log(`\ncast events: ${events.length}`);
for (const e of events.slice(0, 5)) {
  console.log(`  t=${e.timestamp} ability=${e.abilityId} ${e.abilityName ?? ''}`);
}
const minT = Math.min(...events.map((e) => e.timestamp));
const maxT = Math.max(...events.map((e) => e.timestamp));
console.log(`\nmin event t = ${minT}  max = ${maxT}`);
console.log(`event t - fight.startTime range: [${minT - (fight?.startTime ?? 0)}, ${maxT - (fight?.startTime ?? 0)}]`);
console.log(`epoch of min event t (if epoch): ${new Date(minT).toISOString()}`);
console.log(`report.startTime + fight.startTime = ${report.startTime + (fight?.startTime ?? 0)} -> ${new Date(report.startTime + (fight?.startTime ?? 0)).toISOString()}`);
