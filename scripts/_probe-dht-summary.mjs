/**
 * 2×2 汇总：{非变身, 变身} × {直接裂劈, 炸弹→裂劈}。
 * 输出每组的「消耗串」明细与暗物质跳数，供报告引用。
 *
 * 用法：node scripts/_probe-dht-summary.mjs
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const client = new WclClient({
  graphql: new GraphqlClient({
    tokenProvider: new AuthManager(),
    rateLimiter: new RateLimitManager(),
  }),
});
const service = new AppService(client);

const CASES = [
  { key: 'A', code: 'mnNQW16gjB9azRYx', fight: 4, meta: false, bomb: false },
  { key: 'B', code: 'ZkNRKgqwvcPATJWF', fight: 5, meta: false, bomb: true },
  { key: 'C', code: 'gZdfyxDQXNLAcFTR', fight: 7, meta: true, bomb: false },
  { key: 'D', code: 'gZdfyxDQXNLAcFTR', fight: 6, meta: true, bomb: true },
  // E：炸弹后**等流星全落地**再裂劈（2zM7... 的对照实验）
  { key: 'E', code: '2zM7CBymFHtY8XhN', fight: 1, meta: true, bomb: true },
];

const METEOR = 1256306;
const KILLER = 1256617;
const SHOWER = 1264130;
const BOMB = 247454;
const BOMB_DMG = 247455;
const CLEAVE = 228477;
const CLEAVE_DMG = 228478;
const dmgOf = (e) => e.unmitigatedAmount ?? e.amount ?? 0;

const out = [];
for (const c of CASES) {
  const [fights, players] = await Promise.all([
    client.getFights(c.code),
    service.getPlayers(c.code, c.fight),
  ]);
  const fight = fights.find((f) => f.id === c.fight);
  const player = players.find((p) => /demon ?hunter/i.test(p.className ?? ''));
  const [dmg, casts] = await Promise.all([
    client.getPlayerDamage({ reportCode: c.code, fightId: c.fight, sourceId: player.id }),
    client.getPlayerCasts({ reportCode: c.code, fightId: c.fight, sourceId: player.id }),
  ]);

  const spenders = casts
    .filter((x) => x.abilityId === BOMB || x.abilityId === CLEAVE)
    .sort((a, b) => a.timestamp - b.timestamp);
  const meteors = dmg
    .filter((d) => d.abilityId === METEOR || d.abilityId === KILLER)
    .sort((a, b) => a.timestamp - b.timestamp);

  // 流星串
  const volleys = [];
  for (const m of meteors) {
    const last = volleys[volleys.length - 1];
    if (last && m.timestamp - last[last.length - 1].timestamp <= 700) last.push(m);
    else volleys.push([m]);
  }

  const volleyInfo = volleys.map((v) => {
    const start = v[0].timestamp;
    let owner;
    for (const s of spenders) if (s.timestamp <= start - 200) owner = s;
    const normal = v.filter((m) => m.abilityId === METEOR).length;
    const big = v.filter((m) => m.abilityId === KILLER).length;
    return {
      at: ((start - fight.startTime) / 1000).toFixed(2),
      owner: owner ? (owner.abilityId === BOMB ? '炸弹' : '裂劈') : '?',
      ownerAt: owner ? ((owner.timestamp - fight.startTime) / 1000).toFixed(2) : '-',
      normal,
      big,
      total: v.reduce((a, m) => a + dmgOf(m), 0),
      offsets: v.map((m) => m.timestamp - start),
    };
  });

  const showers = dmg.filter((d) => d.abilityId === SHOWER);
  const showerInfo = showers.length
    ? {
        ticks: showers.length,
        total: showers.reduce((a, d) => a + dmgOf(d), 0),
        first: ((showers[0].timestamp - fight.startTime) / 1000).toFixed(2),
        last: ((showers[showers.length - 1].timestamp - fight.startTime) / 1000).toFixed(2),
      }
    : null;

  const ownOf = (cast, id) =>
    dmg
      .filter((d) => d.abilityId === id && d.timestamp >= cast.timestamp - 100 && d.timestamp <= cast.timestamp + 1400)
      .reduce((a, d) => a + dmgOf(d), 0);

  const cleaves = spenders
    .filter((s) => s.abilityId === CLEAVE)
    .map((s) => ({ at: ((s.timestamp - fight.startTime) / 1000).toFixed(2), dmg: ownOf(s, CLEAVE_DMG) }));
  const bombs = spenders
    .filter((s) => s.abilityId === BOMB)
    .map((s) => ({ at: ((s.timestamp - fight.startTime) / 1000).toFixed(2), dmg: ownOf(s, BOMB_DMG) }));

  out.push({ ...c, dur: ((fight.endTime - fight.startTime) / 1000).toFixed(0), volleyInfo, showerInfo, cleaves, bombs });
}

for (const r of out) {
  console.log(`\n### ${r.key}  变身=${r.meta ? '是' : '否'} 炸弹=${r.bomb ? '是' : '否'}  (${r.code}#${r.fight}, ${r.dur}s)`);
  for (const v of r.volleyInfo) {
    console.log(
      `  流星串 @${v.at}s ← ${v.owner}@${v.ownerAt}s : ${v.normal} 普通 + ${v.big} 灭世灾星 = ` +
        `${v.normal + v.big} 颗, ${v.total} 伤害, 落点间隔 ${v.offsets.map((o) => o + 'ms').join(' / ')}`,
    );
  }
  if (r.showerInfo) {
    console.log(
      `  暗物质: ${r.showerInfo.ticks} 跳 / ${r.showerInfo.total} 伤害 (${r.showerInfo.first}s → ${r.showerInfo.last}s)`,
    );
  } else {
    console.log('  暗物质: 无');
  }
  console.log(`  炸弹本体: ${r.bombs.map((b) => `${b.at}s=${b.dmg}`).join(', ') || '-'}`);
  console.log(`  裂劈本体: ${r.cleaves.map((c) => `${c.at}s=${c.dmg}`).join(', ')}`);
}
