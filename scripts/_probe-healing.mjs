/**
 * Probe: what does WCL `Healing` dataType return for sourceID vs targetID?
 *
 * Phase O verified DamageTaken+sourceID=victim and DamageDone+targetID=mob.
 * Before wiring healing into the death review, verify the healing channel
 * with a real log instead of assuming the symmetry.
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

const actors = await client.getActors(reportCode);
const players = actors.filter((a) => a.type === 'Player');
console.log(`players: ${players.length}`);

const deaths = await client.getEvents({ reportCode, fightId, dataType: 'Deaths' });
console.log(`deaths: ${deaths.length}`);
const dead = deaths.filter((e) => e.type === 'death' && e.targetId !== undefined);
for (const d of dead) {
  const name = players.find((p) => p.id === d.targetId)?.name ?? `#${d.targetId}`;
  console.log(`  death: ${name} (#${d.targetId}) @${d.timestamp}`);
}

const victims = dead
  .map((d) => d.targetId)
  .filter((id) => id !== undefined);
// Prefer a non-healer victim: heals done BY a healer would poison the
// sourceID-vs-targetID comparison. #5 is a mage in this log.
const victim = victims.find((id) => id === 5) ?? victims[0];
if (victim === undefined) {
  console.log('no deaths found; abort');
  process.exit(0);
}
const victimName = players.find((p) => p.id === victim)?.name ?? `#${victim}`;
console.log(`\nprobing victim ${victimName} (#${victim})`);

const bySource = await client.getEvents({
  reportCode, fightId, dataType: 'Healing', sourceId: victim,
});
console.log(`\nHealing + sourceID=${victim}: ${bySource.length} events`);
console.log(healStats(`by-source`, bySource, victim));

const byTarget = await client.getEvents({
  reportCode, fightId, dataType: 'Healing', targetId: victim,
});
console.log(`\nHealing + targetID=${victim}: ${byTarget.length} events`);
console.log(healStats(`by-target`, byTarget, victim));
console.log(
  byTarget
    .filter((e) => e.type === 'heal' && e.targetId === victim)
    .slice(0, 3)
    .map((e) => JSON.stringify({
      t: e.timestamp, src: e.sourceId, tgt: e.targetId,
      ability: e.abilityId, amount: e.amount,
    }))
    .join('\n'),
);

function healStats(label, events, pid) {
  const heals = events.filter((e) => e.type === 'heal');
  const onVictim = heals.filter((e) => e.targetId === pid && (e.amount ?? 0) > 0);
  const byVictim = heals.filter((e) => e.sourceId === pid && (e.amount ?? 0) > 0);
  const types = {};
  for (const e of events) types[e.type] = (types[e.type] ?? 0) + 1;
  return `${label}: total=${events.length} typeBreakdown=${JSON.stringify(types)} ` +
    `healOnVictim=${onVictim.length} (sum ${onVictim.reduce((s, e) => s + (e.amount ?? 0), 0)}) ` +
    `healByVictim=${byVictim.length} (sum ${byVictim.reduce((s, e) => s + (e.amount ?? 0), 0)})`;
}
