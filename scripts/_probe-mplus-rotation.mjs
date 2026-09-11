/**
 * Probe: Phase AA M+ rotation-evaluation diagnosis.
 *
 * Forces `mythicPlus: 'evaluate'` on the real M+ report
 * (fXdMjWKJbpna6yHv fight 13, M+10) to measure what the verdict stream
 * WOULD say now that the Phase V fixes (never-observed filter, blood-DK
 * confidence downgrade) are in. Decision input for how to open the gate:
 * per-player verdict distribution, mistake reasons, and time clustering
 * (trash pulls vs boss).
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';
import { evaluateRotation } from '../packages/analysis-engine/dist/index.js';

const auth = new AuthManager();
const graphql = new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() });
const client = new WclClient({ graphql });
const service = new AppService(client);

const reportCode = 'fXdMjWKJbpna6yHv';
const fightId = 13;

const players = await service.getPlayers(reportCode, fightId);
const wanted = players.filter((p) =>
  ['Arms', 'Blood', 'Arcane', 'Elemental'].includes(p.specName ?? ''),
);

for (const p of wanted) {
  // loadCombatContext is TS-private but reachable at runtime from plain JS.
  const { report, fight, player, events } = await service.loadCombatContext(
    reportCode,
    fightId,
    p.id,
  );
  const evalSkip = evaluateRotation({ report, fight, player, events });
  const evalForce = evaluateRotation(
    { report, fight, player, events },
    { mythicPlus: 'evaluate' },
  );

  console.log(`\n=== ${p.name} (${p.specName}) ===`);
  console.log(`default gate: findings=${evalSkip.findings.length} result=${evalSkip.result ? 'present' : 'none'}`);

  const r = evalForce.result;
  if (!r) {
    console.log('forced: no result (no knowledge)');
    continue;
  }
  const counts = {};
  for (const d of r.decisions) counts[d.verdict] = (counts[d.verdict] ?? 0) + 1;
  const total = r.decisions.length;
  const pct = (n) => `${n} (${((n / total) * 100).toFixed(0)}%)`;
  console.log(`forced: decisions=${total} verdicts: ${JSON.stringify(counts)}`);
  console.log(`  mistake=${pct(counts.mistake ?? 0)} suboptimal=${pct(counts.suboptimal ?? 0)} correct=${pct(counts.correct ?? 0)} unknown=${pct(counts.unknown ?? 0)} acceptable=${pct(counts.acceptable ?? 0)}`);

  // Mistake / suboptimal reason profile: which expected rules dominate?
  const reasons = {};
  for (const d of r.decisions) {
    if (d.verdict === 'mistake' || d.verdict === 'suboptimal') {
      const key = `${d.verdict}: expect=${d.expectedKey ?? '?'} actual=${d.actualKey}`;
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
  }
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6);
  for (const [key, n] of top) console.log(`  ${key} ×${n}`);

  // Time clustering: mistakes per 60s bucket (trash vs boss phases).
  const fightStart = fight.startTime;
  const bucket = {};
  for (const d of r.decisions) {
    if (d.verdict !== 'mistake' && d.verdict !== 'suboptimal') continue;
    const t = Math.floor((d.time - fightStart) / 60_000);
    bucket[t] = (bucket[t] ?? 0) + 1;
  }
  console.log(`  flags by minute: ${JSON.stringify(bucket)}`);

  // Findings the stream would emit
  console.log(`  forced findings: ${evalForce.findings.length}`);
  for (const f of evalForce.findings.slice(0, 4)) {
    console.log(`    [${f.severity}] ${f.id}: ${f.title}`);
  }
}
