/**
 * 合并时间线：变身 / 炸弹 / 裂劈 / 破裂 / 虚落层数 / 流星 / 暗物质 / 大灭。
 *
 * 用法：node scripts/_probe-dht-trace.mjs <reportCode> <fightId> [player] [fromSec] [toSec]
 * 数据经 packages/wcl-client（v2），原始 stack 值经 GraphqlClient 直取（仍是 v2，不碰网页）。
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const [, , code, fightArg, playerArg, fromArg, toArg] = process.argv;
const fightId = Number(fightArg);
const auth = new AuthManager();
const client = new WclClient({
  graphql: new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() }),
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
const nameOf = (id) => names.get(id) ?? `#${id}`;
const rel = (t) => (t - fight.startTime) / 1000;
const dmgOf = (e) => e.unmitigatedAmount ?? e.amount ?? 0;

const VOIDFALL = 1256322;
const tracked = {
  casts: new Set([187827, 247454, 228477, 263642, 225919, 225921]),
  dmg: new Set([1256306, 1256617, 1264130, 1256667, 247455, 228478, 1310209]),
};

const [dmg, casts] = await Promise.all([
  client.getPlayerDamage({ reportCode: code, fightId, sourceId: player.id }),
  client.getPlayerCasts({ reportCode: code, fightId, sourceId: player.id }),
]);

// 虚落层数：走 wcl-client 的 Buffs 流（归一化层已保留 stack 与 rawType）
const buffRows = await client.getEvents({
  reportCode: code,
  fightId,
  sourceId: player.id,
  dataType: 'Buffs',
});
const stackRows = buffRows
  .filter((e) => e.abilityId === VOIDFALL)
  .map((e) => ({ timestamp: e.timestamp, type: e.rawType, stack: e.stack }));

const from = Number(fromArg ?? -1) * 1000 + fight.startTime;
const to = Number(toArg ?? 1e9) * 1000 + fight.startTime;
const rows = [];
for (const c of casts) {
  if (!tracked.casts.has(c.abilityId ?? -1)) continue;
  rows.push({ t: c.timestamp, kind: 'CAST', text: nameOf(c.abilityId) });
}
for (const d of dmg) {
  if (!tracked.dmg.has(d.abilityId ?? -1)) continue;
  rows.push({ t: d.timestamp, kind: 'DMG', text: `${nameOf(d.abilityId)} ${dmgOf(d)}` });
}
for (const b of stackRows) {
  rows.push({
    t: b.timestamp,
    kind: 'BUFF',
    text: `虚落 ${b.type}${b.stack !== undefined ? ` → ${b.stack}` : ''}`,
  });
}
rows.sort((a, b) => a.t - b.t);

console.log(`== ${code} fight #${fightId} ${fight.name} | ${player.name} | ${((fight.endTime - fight.startTime) / 1000).toFixed(0)}s`);
console.log(`   虚落原始事件 ${stackRows.length} 条\n`);
for (const r of rows) {
  if (r.t < from || r.t > to) continue;
  const mark = r.kind === 'DMG' && /流星|灭世灾星|流星雨|大灭/.test(r.text) ? ' <<<' : '';
  console.log(`  ${rel(r.t).toFixed(2).padStart(7)}s ${r.kind.padEnd(4)} ${r.text}${mark}`);
}
