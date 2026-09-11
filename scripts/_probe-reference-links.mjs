/**
 * Live check: does a real Mythic+ run now produce openable reference links,
 * an honest pool level range, and Chinese ability names in the findings?
 *
 * Report fXdMjWKJbpna6yHv fight 13 = 诸王之眠 +10 (M+ Season 2, zone 55).
 * Covers Elemental / Arms / Blood / Arcane when present, plus the real logs.
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() });
const service = new AppService(new WclClient({ graphql }));

const reportCode = 'fXdMjWKJbpna6yHv';
const fightId = 13;

const players = await service.getPlayers(reportCode, fightId);
const wanted = players.filter((p) =>
  ['Arms', 'Blood', 'Arcane', 'Elemental'].includes(p.specName ?? ''),
);

for (const p of wanted) {
  const { result } = await service.analyzePlayer(reportCode, {
    fightId,
    playerId: p.id,
  });

  console.log(`\n=== ${p.name} (${p.specName}) ===`);
  const ref = result.reference;
  if (!ref) {
    console.log('  NO REFERENCE');
  } else {
    console.log(`  pool       : ${ref.source.pool}`);
    console.log(`  keyLevel   : ${ref.source.keyLevel}  poolLevels: ${JSON.stringify(ref.source.poolLevels)}`);
    console.log(`  gapVsP50   : ${ref.player?.gapVsP50Pct}%  (p50=${Math.round(ref.stats.p50)})`);
    console.log(`  rankingsUrl: ${ref.source.rankingsUrl}`);
    const t = ref.top[0];
    if (t) console.log(`  top run    : ${t.name} +${t.keyLevel} ${Math.round(t.amount)} → ${t.runUrl}`);
  }
  console.log(`  findings: ${result.findings.length}`);
  for (const f of result.findings.slice(0, 6)) {
    const ability =
      f.expected?.ability ?? (f.evidence ?? []).find((e) => e.ability)?.ability;
    console.log(`    [${f.severity}] ${f.title}${ability ? `   · ability=${ability}` : ''}`);
  }
}
