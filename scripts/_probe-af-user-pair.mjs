/**
 * Verify Phase AF against the pair the user actually cares about:
 *   mine  : cn.warcraftlogs.com/reports/fXdMjWKJbpna6yHv?fight=13   (奥法)
 *   target: cn.warcraftlogs.com/reports/DykTVdzMJwhvBKm2?fight=28   (榜首, 奥法)
 *
 * Two questions:
 *   1. Does the automatic baseline pick that very run (i.e. is DykTVdzMJwhvBKm2
 *      the #1 row of the Arcane Mage rankings for this dungeon)?
 *   2. Does the head-to-head model come out complete — rates, ability table
 *      with Chinese names, finding diff?
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

const MINE = { reportCode: 'fXdMjWKJbpna6yHv', fightId: 13 };
const THEIR = { reportCode: 'DykTVdzMJwhvBKm2', fightId: 28 };

const myPlayers = await service.getPlayers(MINE.reportCode, MINE.fightId);
console.log('我的战斗参战名单:');
for (const p of myPlayers) console.log(`  ${p.id}  ${p.name}  ${p.specName ?? '-'}`);

const me = myPlayers.find((p) => p.specName === 'Arcane');
if (!me) throw new Error('本场没有奥法');
console.log(`\n我 = ${me.name} (${me.specName}) actor ${me.id}`);

const mine = await service.analyzeFight(MINE.reportCode, {
  fightId: MINE.fightId,
  playerId: me.id,
});
const ref = mine.result.reference;
console.log(`\n基线池: ${ref?.source.pool}`);
console.log(`top10 里是否有 DykTVdzMJwhvBKm2？`);
for (const [i, t] of (ref?.top ?? []).entries()) {
  const hit = t.reportCode === THEIR.reportCode ? '  <<<< 用户说的榜首' : '';
  console.log(
    `  #${i + 1} ${t.name} +${t.keyLevel ?? '?'} ${Math.round(t.amount)} report=${t.reportCode} fight=${t.fightId}${hit}`,
  );
}

const cmp = await service.compareToTopRun(MINE.reportCode, {
  fightId: MINE.fightId,
  playerId: me.id,
  rankIndex: 0,
});

console.log(`\n===== 对标模型 =====`);
console.log(`status: ${cmp.status}`);
console.log(`notice: ${cmp.notice}`);
console.log(
  `mine: ${cmp.mine.playerName} +${cmp.mine.keyLevel ?? '?'} ${Math.round((cmp.mine.durationMs ?? 0) / 1000)}s`,
);
if (cmp.target) {
  console.log(
    `target: #${cmp.target.rank} ${cmp.target.name} +${cmp.target.keyLevel ?? '?'} ${Math.round(cmp.target.amount)} → ${cmp.target.rankUrl}`,
  );
}

console.log('\n--- 指标对照 ---');
for (const row of cmp.rows) {
  console.log(
    `  ${row.label.padEnd(12)} 我=${row.mine ?? '-'}  榜首=${row.theirs ?? '-'}  差=${row.deltaPct ?? '-'}%`,
  );
}

console.log('\n--- 技能频率对照（次/分钟）---');
for (const a of cmp.abilities) {
  console.log(
    `  ${a.name.padEnd(16)} 我=${a.minePerMin}  榜首=${a.theirsPerMin}  差=${a.deltaPct ?? '-'}%`,
  );
}

console.log('\n--- 判定档分布 ---');
if (cmp.rotation) {
  const r = cmp.rotation;
  console.log(
    `  comparable=${r.comparable}  scenario 我=${r.mine.scenario} 他=${r.theirs.scenario}`,
  );
  console.log(
    `  正确率（去掉 unknown）我=${r.correctRateMine ?? '-'}%  榜首=${r.correctRateTheirs ?? '-'}%`,
  );
  console.log(`  决策数 我=${r.mine.decisionCount}  榜首=${r.theirs.decisionCount}`);
  console.log(`  breakdown 我=${JSON.stringify(r.mine.breakdown)}`);
  console.log(`  breakdown 他=${JSON.stringify(r.theirs.breakdown)}`);
} else {
  console.log('  （无判定流：专精无知识 / 大秘境门控）');
}

console.log('\n--- 问题差异 ---');
console.log(`  只有我有 (${cmp.findingsOnlyMine.length}):`);
for (const t of cmp.findingsOnlyMine) console.log(`    · ${t}`);
console.log(`  双方都有 (${cmp.findingsShared.length}):`);
for (const t of cmp.findingsShared) console.log(`    · ${t}`);

// And the user's manual target, straight through — no ranking lookup at all.
console.log('\n===== 手动指定榜首日志（用户给的坐标）=====');
const theirPlayers = await service.getPlayers(THEIR.reportCode, THEIR.fightId);
console.log(`其参战名单 ${theirPlayers.length} 人:`);
for (const p of theirPlayers.slice(0, 8)) {
  console.log(`  ${p.id}  ${p.name}  ${p.specName ?? '-'}`);
}
