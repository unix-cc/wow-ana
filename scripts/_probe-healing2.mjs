/**
 * Probe 2: compare `Healing` vs `HealingTaken` dataTypes for heals received.
 * Verified so far: Healing + targetID=victim returns heals received (1872
 * effective rows / 17.5M for #5). Check whether HealingTaken + sourceID is
 * the cleaner channel (symmetry with DamageTaken + sourceID=victim).
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({
  tokenProvider: auth,
  rateLimiter: new RateLimitManager(),
});
const client = new WclClient({ graphql });

const reportCode = 'YR1c6fNvbGjtVdgH';
const fightId = 1;
const victim = 5; // 黑脸法, non-healer

async function stats(label, params) {
  const events = await client.getEvents({ reportCode, fightId, ...params });
  const heals = events.filter((e) => e.type === 'heal');
  const onVictim = heals.filter((e) => e.targetId === victim && (e.amount ?? 0) > 0);
  const types = {};
  for (const e of events) types[e.type] = (types[e.type] ?? 0) + 1;
  console.log(
    `${label}: total=${events.length} types=${JSON.stringify(types)} ` +
    `effectiveHealsOnVictim=${onVictim.length} sum=${onVictim.reduce((s, e) => s + (e.amount ?? 0), 0)}`,
  );
}

await stats('Healing+targetID   ', { dataType: 'Healing', targetId: victim });
await stats('HealingTaken+sourceID', { dataType: 'HealingTaken', sourceId: victim });
await stats('HealingTaken+targetID', { dataType: 'HealingTaken', targetId: victim });
