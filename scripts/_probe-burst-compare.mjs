/**
 * Probe: burst-phase comparison live verification — run compareToTopRun on
 * real reports and print the phase (burst-vs-filler) block that now rides on
 * the head-to-head comparison.
 *
 * Usage:
 *   node scripts/_probe-burst-compare.mjs <reportCode> <fightId> [playerFilter]
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const reportCode = process.argv[2];
const fightId = Number(process.argv[3]);
const nameFilter = process.argv[4];

const auth = new AuthManager();
const graphql = new GraphqlClient({
  tokenProvider: auth,
  rateLimiter: new RateLimitManager(),
});
const client = new WclClient({ graphql });
const service = new AppService(client);

const players = await service.getPlayers(reportCode, fightId);
const wanted = players.filter((p) => {
  if (nameFilter && !p.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
  return ['Beast Mastery', 'Arcane', 'Elemental', 'Blood', 'Retribution', 'Arms'].includes(p.specName ?? '');
});
console.log(`report ${reportCode} fight ${fightId}: ${players.length} players, ${wanted.length} knowledge-covered`);

for (const player of wanted) {
  console.log(`\n${'='.repeat(78)}`);
  console.log(`=== ${player.name} (#${player.id}) ${player.specName}`);
  const comparison = await service.compareToTopRun(reportCode, {
    fightId,
    playerId: player.id,
  });
  if (comparison.status !== 'ok') {
    console.log(`status=${comparison.status} — ${comparison.notice}`);
    continue;
  }
  console.log(`target: #${comparison.target?.rank} ${comparison.target?.name} +${comparison.target?.keyLevel ?? '?'}`);
  console.log(`phase: ${comparison.phase !== undefined ? 'present' : 'absent'}`);
  console.log(`rules: ${comparison.rules !== undefined ? `${comparison.rules.rules.length} rows` : 'absent'}`);
  if (comparison.rules !== undefined && comparison.rules.rules.length > 0) {
    for (const r of comparison.rules.rules) {
      console.log(
        `  [${r.deltaPp !== undefined ? (r.deltaPp < 0 ? '▼' : '▲') : '·'}${r.deltaPp ?? 0}pp${r.comparable ? '' : ' 样本少'}] ${r.label} — ` +
          `我 ${r.mine.adherenceRate ?? '-'}% (n=${r.mine.decisions}, 失误${r.mineMistakes}) ` +
          `/ 榜首 ${r.theirs.adherenceRate ?? '-'}% (n=${r.theirs.decisions}, 失误${r.theirsMistakes})`,
      );
    }
  }
  if (comparison.phase !== undefined) {
    const p = comparison.phase;
    console.log(`comparable=${p.comparable}`);
    console.log(`mine  : anchors=${p.mine.anchors.map((a) => `${a.name}×${a.castCount}`).join(', ')} ` +
      `inBurst=${p.mine.inBurstDecisions} filler=${p.mine.fillerDecisions} ` +
      `perWin=${p.mine.perWindowDecisions ?? '-'} burstCorrect=${p.mine.inBurstCorrectRate ?? '-'}% ` +
      `fillerCorrect=${p.mine.fillerCorrectRate ?? '-'}%`);
    console.log(`theirs: anchors=${p.theirs.anchors.map((a) => `${a.name}×${a.castCount}`).join(', ')} ` +
      `inBurst=${p.theirs.inBurstDecisions} filler=${p.theirs.fillerDecisions} ` +
      `perWin=${p.theirs.perWindowDecisions ?? '-'} burstCorrect=${p.theirs.inBurstCorrectRate ?? '-'}% ` +
      `fillerCorrect=${p.theirs.fillerCorrectRate ?? '-'}%`);
  }
}
