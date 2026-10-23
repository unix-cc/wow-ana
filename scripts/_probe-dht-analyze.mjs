/**
 * 汇总：每一次「消耗虚落」的施放（幽魂炸弹 / 灵魂裂劈）后面实际落了几颗流星、多少伤害，
 * 以及本体伤害。流星按「最近一次前置施放」归因。
 *
 * 用法：node scripts/_probe-dht-analyze.mjs <reportCode> <fightId> [player]
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const [, , code, fightArg, playerArg] = process.argv;
const fightId = Number(fightArg);
const client = new WclClient({
  graphql: new GraphqlClient({
    tokenProvider: new AuthManager(),
    rateLimiter: new RateLimitManager(),
  }),
});
const service = new AppService(client);

const [fights, names, players] = await Promise.all([
  client.getFights(code),
  client.getAbilityNames(code),
  service.getPlayers(code, fightId),
]);
const fight = fights.find((f) => f.id === fightId);
const player = playerArg
  ? players.find((p) => p.name.toLowerCase().includes(playerArg.toLowerCase()))
  : players.find((p) => /demon ?hunter/i.test(p.className ?? ''));

const VOIDFALL_METEOR = 1256306;
const WORLD_KILLER = 1256617;
const METEOR_SHOWER = 1264130; // 暗物质
const BOMB = 247454;
const BOMB_DMG = 247455;
const CLEAVE = 228477;
const CLEAVE_DMG = 228478;
const META = 187827;

const dmgOf = (e) => e.unmitigatedAmount ?? e.amount ?? 0;
const rel = (t) => (t - fight.startTime) / 1000;

const [dmg, casts] = await Promise.all([
  client.getPlayerDamage({ reportCode: code, fightId, sourceId: player.id }),
  client.getPlayerCasts({ reportCode: code, fightId, sourceId: player.id }),
]);

const spenders = casts
  .filter((c) => c.abilityId === BOMB || c.abilityId === CLEAVE)
  .sort((a, b) => a.timestamp - b.timestamp);

const meteors = dmg
  .filter((d) => d.abilityId === VOIDFALL_METEOR || d.abilityId === WORLD_KILLER)
  .sort((a, b) => a.timestamp - b.timestamp);
const showers = dmg.filter((d) => d.abilityId === METEOR_SHOWER).sort((a, b) => a.timestamp - b.timestamp);

// 本体伤害：施放后 1.2s 内的同名伤害事件（炸弹有 ~0.9s 前摇）
const ownDamage = (cast, dmgId) => {
  const rows = dmg.filter(
    (d) => d.abilityId === dmgId && d.timestamp >= cast.timestamp - 100 && d.timestamp <= cast.timestamp + 1400,
  );
  return rows.reduce((s, d) => s + dmgOf(d), 0);
};

const metas = casts.filter((c) => c.abilityId === META).sort((a, b) => a.timestamp - b.timestamp);

// 流星归因：先按「连续串」分组（间隔 >700ms 视为新的一串），
// 再把整串归给串首之前最近的那次消耗施放。
// 不能逐颗归因：灭世灾星常在炸弹按下之后才落地，会被错判给炸弹。
const volleys = [];
for (const m of meteors) {
  const last = volleys[volleys.length - 1];
  if (last && m.timestamp - last[last.length - 1].timestamp <= 700) last.push(m);
  else volleys.push([m]);
}
const attributed = new Map();
for (const volley of volleys) {
  const start = volley[0].timestamp;
  let best;
  for (const s of spenders) {
    if (s.timestamp <= start - 200 && (!best || s.timestamp > best.timestamp)) best = s;
  }
  if (!best) {
    console.log(`  ! 未归因流星串 @${rel(start).toFixed(2)}s（${volley.length} 颗）`);
    continue;
  }
  attributed.set(`${best.timestamp}`, [...(attributed.get(`${best.timestamp}`) ?? []), ...volley]);
}

console.log(`\n== ${code} fight #${fightId} | ${player.name} | ${((fight.endTime - fight.startTime) / 1000).toFixed(0)}s`);
console.log('时间    施放      距变身   本体伤害   流星(普通+灾星)  流星伤害   暗物质  备注');

for (const s of spenders) {
  const list = attributed.get(`${s.timestamp}`) ?? [];
  const normal = list.filter((m) => m.abilityId === VOIDFALL_METEOR).length;
  const big = list.filter((m) => m.abilityId === WORLD_KILLER).length;
  const sum = list.reduce((a, m) => a + dmgOf(m), 0);
  const own = ownDamage(s, s.abilityId === BOMB ? BOMB_DMG : CLEAVE_DMG);
  const shower = showers
    .filter((d) => d.timestamp >= s.timestamp - 200 && d.timestamp <= s.timestamp + 7000)
    .reduce((a, d) => a + dmgOf(d), 0);
  const prevMeta = metas.filter((m) => m.timestamp <= s.timestamp).pop();
  const sinceMeta = prevMeta ? ((s.timestamp - prevMeta.timestamp) / 1000).toFixed(1) : '-';
  const prevSpender = spenders.filter((x) => x.timestamp < s.timestamp).pop();
  const gap = prevSpender ? ((s.timestamp - prevSpender.timestamp) / 1000).toFixed(1) : '-';
  const note =
    prevSpender && s.timestamp - prevSpender.timestamp < 1500
      ? `接在${prevSpender.abilityId === BOMB ? '炸弹' : '裂劈'}后 ${gap}s`
      : `独立（距上次 ${gap}s）`;
  console.log(
    `${rel(s.timestamp).toFixed(2).padStart(6)}s ${(s.abilityId === BOMB ? '炸弹' : '裂劈').padEnd(6)} ` +
      `${String(sinceMeta).padStart(5)}s ${String(own || '-').padStart(8)} ` +
      `${String(normal).padStart(8)}+${big} ${String(sum || '-').padStart(10)} ${String(shower || '-').padStart(8)}  ${note}`,
  );
}

const byKind = (kind) => {
  const rows = spenders.filter((s) => (kind === 'bomb' ? s.abilityId === BOMB : s.abilityId === CLEAVE));
  let meteorsTotal = 0;
  let ownTotal = 0;
  for (const s of rows) {
    meteorsTotal += (attributed.get(`${s.timestamp}`) ?? []).length;
    ownTotal += ownDamage(s, s.abilityId === BOMB ? BOMB_DMG : CLEAVE_DMG);
  }
  return { n: rows.length, meteorsTotal, ownTotal };
};
const b = byKind('bomb');
const c = byKind('cleave');
console.log(
  `汇总：炸弹 ${b.n} 次 → ${b.meteorsTotal} 颗流星，本体合计 ${b.ownTotal}；` +
    `裂劈 ${c.n} 次 → ${c.meteorsTotal} 颗流星，本体合计 ${c.ownTotal}`,
);
