/**
 * Probe: Phase U verification — run the new Arms Warrior / Ret Paladin
 * / enriched Blood DK knowledge against the real M+ report
 * fXdMjWKJbpna6yHv fight 13 (user: "这里面有dkt、奥法、元素萨、武器战").
 *
 * Checks: spec resolution, analyzer routing, findings (M+ gates must hold),
 * knowledge versions, and that ability ids actually match cast events.
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({
  tokenProvider: auth,
  rateLimiter: new RateLimitManager(),
});
const client = new WclClient({ graphql });
const service = new AppService(client);

const reportCode = 'fXdMjWKJbpna6yHv';
const fightId = 13;

const players = await service.getPlayers(reportCode, fightId);
console.log(`fight ${fightId} players:`);
for (const p of players) {
  console.log(
    `  #${p.id} ${p.name} — ${p.className ?? p.specName ?? '?'} (specId=${p.specId ?? '?'})`,
  );
}

const wanted = players.filter((p) =>
  ['Arms', 'Blood', 'Arcane', 'Elemental', 'Retribution'].includes(p.specName ?? ''),
);
console.log(`\nanalyzing ${wanted.length} players ...`);

for (const p of wanted) {
  const { summary, result } = await service.analyzePlayer(reportCode, {
    fightId,
    playerId: p.id,
  });
  console.log(`\n=== ${p.name} (#${p.id}) spec=${p.specName} ===`);
  console.log(`versions: ${JSON.stringify(result.versions)}`);
  console.log(`spec metrics: ${JSON.stringify(result.metrics.spec ?? null)}`);
  console.log(`score: ${result.score?.overall ?? '-'}  findings: ${result.findings.length}`);
  for (const f of result.findings) {
    console.log(
      `  [${f.severity}] ${f.id} — ${f.title} (conf=${f.confidence ?? '-'})`,
    );
    console.log(`      ${f.description}`);
  }

  // analyzeFight adds the Condition→Action verdict stream (rotation digest).
  const fight = await service.analyzeFight(reportCode, {
    fightId,
    playerId: p.id,
  });
  if (fight.rotation) {
    const r = fight.rotation;
    console.log(`rotation digest: scenario=${r.scenario} knowledge=${r.knowledge.knowledgeVersion} decisions=${r.decisionCount} unknown=${r.unknownCount}`);
    console.log(`breakdown: ${JSON.stringify(r.breakdown)}`);
    for (const s of r.samples.slice(0, 6)) {
      console.log(
        `  t=${s.time} cast=${s.actualKey} verdict=${s.verdict} expected=${s.expectedKey ?? s.expectedRuleId ?? s.acceptableRuleId ?? '?'}`,
      );
    }
  } else {
    console.log('rotation: none');
  }
  if (summary) {
    console.log(`summary: ${JSON.stringify({ dps: summary.dps, totalDamage: summary.totalDamage })}`);
  }
}
