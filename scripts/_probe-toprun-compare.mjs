/**
 * Live check of Phase AF: 榜首逐场对标.
 *
 * Runs the real comparison on a real M+ report (诸王之眠 +10 Elemental) and
 * prints the model the UI will render — including the honest degradations.
 */
import {
  AuthManager,
  GraphqlClient,
  RateLimitManager,
  WclClient,
} from '../packages/wcl-client/dist/index.js';
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
const me = players.find((p) => p.name === '路鸣泽');
if (!me) throw new Error('player not found');

const cmp = await service.compareToTopRun(reportCode, {
  fightId,
  playerId: me.id,
  rankIndex: 0,
});

console.log(`status: ${cmp.status}`);
console.log(`notice: ${cmp.notice}`);
console.log(`mine: ${cmp.mine.playerName} +${cmp.mine.keyLevel ?? '?'} ${Math.round((cmp.mine.durationMs ?? 0) / 1000)}s`);
if (cmp.target) {
  console.log(
    `target: #${cmp.target.rank} ${cmp.target.name} +${cmp.target.keyLevel ?? '?'} ${Math.round(cmp.target.amount)} → ${cmp.target.rankUrl}`,
  );
}

console.log('\n--- 指标对照 ---');
for (const row of cmp.rows) {
  console.log(
    `  ${row.label.padEnd(14)} 我=${row.mine ?? '-'}  榜首=${row.theirs ?? '-'}  差=${row.deltaPct ?? '-'}%  (越${row.better === 'higher' ? '高' : row.better === 'lower' ? '低' : '—'}越好)`,
  );
  if (row.note) console.log(`      note: ${row.note}`);
}

console.log('\n--- 技能频率对照（次/分钟）---');
for (const a of cmp.abilities) {
  console.log(
    `  ${a.name.padEnd(18)} 我=${a.minePerMin}  榜首=${a.theirsPerMin}  差=${a.deltaPct ?? '-'}%`,
  );
}

console.log('\n--- 问题差异 ---');
console.log(`  只有我有（=差异点，${cmp.findingsOnlyMine.length}）:`);
for (const t of cmp.findingsOnlyMine) console.log(`    · ${t}`);
console.log(`  双方都有（不构成差异，${cmp.findingsShared.length}）:`);
for (const t of cmp.findingsShared) console.log(`    · ${t}`);

// Also exercise the degradation path: an out-of-range rank index.
const none = await service.compareToTopRun(reportCode, {
  fightId,
  playerId: me.id,
  rankIndex: 99,
});
console.log(`\n[degradation] rankIndex=99 → status=${none.status}`);
console.log(`  ${none.notice}`);
