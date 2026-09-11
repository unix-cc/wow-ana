/**
 * Probe: Phase X healer-death attribution on a real wipe.
 * YR1c6fNvbGjtVdgH fight1 (M+10 密谋小径): healer died first, then a 41s
 * cascade killed the rest — subsequent deaths should now explain their
 * healing gap with "治疗者 X 于 N s 前阵亡".
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() });
const client = new WclClient({ graphql });
const service = new AppService(client);

const review = await service.analyzeDeathReview('YR1c6fNvbGjtVdgH', { fightId: 1 });
console.log(`fight: ${review.fightName}  deaths: ${review.deaths.length}  wipes: ${review.wipes.length}`);
for (const d of review.deaths) {
  const attribution = d.healerDiedBefore
    ? ` healerDiedBefore=${d.healerDiedBefore.playerName}(${(d.healerDiedBefore.diedMsBefore / 1000).toFixed(1)}s前, hadHealedVictim=${d.healerDiedBefore.hadHealedVictim})`
    : '';
  const healers = d.healers.length
    ? ` healers=[${d.healers.map((h) => `${h.playerName ?? h.playerId}:${h.total}`).join(', ')}]`
    : '';
  console.log(`\n- ${d.playerName} (${d.role}) @${(d.relativeMs / 1000).toFixed(0)}s [${d.cause}] taken=${d.takenTotal} healed=${d.healingReceived}(${d.healCount})${healers}${attribution}`);
  console.log(`  ${d.summary}`);
}
