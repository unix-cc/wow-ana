/**
 * 复仇 DH（12.1.5）幽魂炸弹 / 灵魂裂劈 / 虚落流星 / 暗物质 的事件级探针。
 *
 * 用法：
 *   node scripts/_probe-dht-meteor.mjs tables <reportCode> <fightId> [playerKeyword]
 *   node scripts/_probe-dht-meteor.mjs seq    <reportCode> <fightId> [playerKeyword] [±ms]
 *
 * 全部数据经 `packages/wcl-client`（v2 GraphQL），不手写 fetch —— 见 CONSTRAINTS.md §3.3。
 * 只读，不写库。
 *
 * 已知 ID（2026-10-23 从 mnNQW16gjB9azRYx 实测）：
 *   Voidfall（虚落 buff）= 1256322      Voidfall Meteor = 1256306
 *   World Killer（第 3 颗大流星）= 1256617   Soul Cleave = 228477 / 228478
 *   Spirit Bomb = 247454 / 247455      Metamorphosis = 187827
 *   Meteor Shower（暗物质 12 跳）= 1264130   Catastrophe = 1256667
 * 伤害一律取 unmitigatedAmount：假人濒死时 amount 会被钳成 1。
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';

const [, , mode, code, fightArg, playerArg, windowArg] = process.argv;
if (!mode || !code || !fightArg) {
  console.error('usage: node scripts/_probe-dht-meteor.mjs <tables|seq> <reportCode> <fightId> [player] [±ms]');
  process.exit(1);
}

const VOIDFALL = 1256322;
const METEORS = new Map([
  [1256306, 'Voidfall Meteor'],
  [1256617, 'World Killer'],
  [1264130, 'Meteor Shower'],
  [117588, 'Meteor'],
  [1256667, 'Catastrophe'],
]);
const BOMB = 247454;
const CLEAVE = 228477;

const auth = new AuthManager();
const client = new WclClient({
  graphql: new GraphqlClient({ tokenProvider: auth, rateLimiter: new RateLimitManager() }),
});
const service = new AppService(client);

const fightId = Number(fightArg);
const [report, fights, names, players] = await Promise.all([
  client.getReport(code),
  client.getFights(code),
  client.getAbilityNames(code),
  service.getPlayers(code, fightId),
]);

const fight = fights.find((f) => f.id === fightId);
if (!fight) {
  console.error(`fight ${fightId} not found`);
  process.exit(1);
}
const nameOf = (id) => names.get(id) ?? METEORS.get(id ?? -1) ?? `#${id}`;
const rel = (t) => ((t - fight.startTime) / 1000).toFixed(2);
const dmgOf = (e) => e.unmitigatedAmount ?? e.amount ?? 0;

console.log(`== ${code} "${report.title ?? ''}" fight #${fight.id} ${fight.name ?? ''} ${((fight.endTime - fight.startTime) / 1000).toFixed(0)}s`);
const dhs = players.filter((p) => /demon ?hunter/i.test(p.className ?? '') || /vengeance|havoc|devourer/i.test(p.specName ?? ''));
const player = playerArg
  ? players.find((p) => p.name.toLowerCase().includes(playerArg.toLowerCase()))
  : dhs[0];
if (!player) {
  console.error('player not found:', players.map((p) => p.name).join(', '));
  process.exit(1);
}
console.log(`>>> ${player.name} #${player.id} (${player.className ?? '?'}/${player.specName ?? '?'})`);

const window = { reportCode: code, fightId, sourceId: player.id };
const [dmg, casts, buffs] = await Promise.all([
  client.getPlayerDamage(window),
  client.getPlayerCasts(window),
  client.getEvents({ ...window, dataType: 'Buffs' }),
]);

const agg = (list) => {
  const m = new Map();
  for (const e of list) {
    const id = e.abilityId ?? 0;
    const cur = m.get(id) ?? { n: 0, amount: 0, max: 0 };
    cur.n += 1;
    cur.amount += dmgOf(e);
    cur.max = Math.max(cur.max, dmgOf(e));
    m.set(id, cur);
  }
  return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].n - a[1].n);
};

if (mode === 'tables') {
  console.log(`\n-- DamageDone by ability (n=${dmg.length}) --`);
  for (const [id, v] of agg(dmg).slice(0, 28)) {
    console.log(`  ${String(id).padStart(7)} ${nameOf(id).padEnd(40)} n=${String(v.n).padStart(5)} total=${String(v.amount).padStart(9)} max=${v.max}`);
  }
  console.log(`\n-- Casts by ability (n=${casts.length}) --`);
  for (const [id, v] of agg(casts).slice(0, 24)) {
    console.log(`  ${String(id).padStart(7)} ${nameOf(id).padEnd(40)} n=${String(v.n).padStart(5)}`);
  }
  const bmap = new Map();
  for (const e of buffs) {
    const id = e.abilityId ?? 0;
    const cur = bmap.get(id) ?? { types: {} };
    cur.types[e.rawType ?? e.type] = (cur.types[e.rawType ?? e.type] ?? 0) + 1;
    bmap.set(id, cur);
  }
  console.log(`\n-- Buff events by ability (n=${buffs.length}) --`);
  const rows = [...bmap.entries()].sort((a, b) => {
    const sum = (o) => Object.values(o.types).reduce((x, y) => x + y, 0);
    return sum(b[1]) - sum(a[1]);
  });
  for (const [id, v] of rows.slice(0, 24)) {
    console.log(`  ${String(id).padStart(7)} ${nameOf(id).padEnd(36)} ${JSON.stringify(v.types)}`);
  }
  process.exit(0);
}

// ---------------- seq ----------------
const around = Number(windowArg ?? 3000);

// 虚落层数重建：applybuff=1，applybuffstack +1，removebuffstack -1，removebuff = 0
const stackEvents = buffs
  .filter((e) => e.abilityId === VOIDFALL)
  .sort((a, b) => a.timestamp - b.timestamp);
let stacks = 0;
const stackAt = [];
for (const e of stackEvents) {
  switch (e.rawType) {
    case 'applybuff':
      stacks = 1;
      break;
    case 'applybuffstack':
      stacks += 1;
      break;
    case 'removebuffstack':
      stacks = Math.max(0, stacks - 1);
      break;
    case 'removebuff':
      stacks = 0;
      break;
    default:
      break;
  }
  stackAt.push({ t: e.timestamp, stacks, raw: e.rawType });
}
const stacksBefore = (t) => {
  let s = 0;
  for (const row of stackAt) if (row.t <= t) s = row.stacks;
  return s;
};

const anchors = casts
  .filter((e) => e.abilityId === BOMB || e.abilityId === CLEAVE)
  .sort((a, b) => a.timestamp - b.timestamp);

console.log(
  `\n虚落事件 ${stackEvents.length} 条；炸弹 ${anchors.filter((a) => a.abilityId === BOMB).length} 次、` +
    `裂劈 ${anchors.filter((a) => a.abilityId === CLEAVE).length} 次\n`,
);

for (const a of anchors) {
  const label = a.abilityId === BOMB ? '炸弹(BOMB)' : '裂劈(CLEAVE)';
  const inWin = dmg
    .filter((e) => e.timestamp >= a.timestamp - around && e.timestamp <= a.timestamp + around)
    .sort((x, y) => x.timestamp - y.timestamp);
  const meteors = inWin.filter((e) => METEORS.has(e.abilityId ?? -1) && e.timestamp >= a.timestamp - 200);
  const meteorSum = meteors.reduce((s, e) => s + dmgOf(e), 0);
  console.log(
    `\n=== ${label} @${rel(a.timestamp)}s 虚落=${stacksBefore(a.timestamp)} | ` +
      `其后流星 ${meteors.length} 颗 / ${meteorSum} 伤害`,
  );
  // 只保留与虚落链路有关的事件，否则会被献祭光环的每秒 tick 淹没
  const CAST_KEEP = new Set([BOMB, CLEAVE, 187827, 263642, 225919, 225921]);
  const DMG_KEEP = new Set([247455, 228478, ...METEORS.keys()]);
  const castRows = casts
    .filter(
      (e) =>
        CAST_KEEP.has(e.abilityId ?? -1) &&
        e.timestamp >= a.timestamp - around &&
        e.timestamp <= a.timestamp + around,
    )
    .sort((x, y) => x.timestamp - y.timestamp);
  const bufRows = stackEvents.filter(
    (e) => e.timestamp >= a.timestamp - around && e.timestamp <= a.timestamp + around,
  );
  const rows = [
    ...castRows.map((e) => ({ t: e.timestamp, kind: 'CAST', id: e.abilityId, dmg: 0, raw: undefined })),
    ...inWin
      .filter((e) => DMG_KEEP.has(e.abilityId ?? -1))
      .map((e) => ({ t: e.timestamp, kind: 'DMG ', id: e.abilityId, dmg: dmgOf(e), raw: undefined })),
    ...bufRows.map((e) => ({ t: e.timestamp, kind: 'BUFF', id: e.abilityId, dmg: 0, raw: e.rawType })),
  ].sort((x, y) => x.t - y.t || (x.kind === 'CAST' ? -1 : 1));
  for (const r of rows) {
    const isMeteor = METEORS.has(r.id ?? -1);
    const tag = r.kind === 'BUFF' ? `[${r.raw}]` : r.kind.trim();
    console.log(
      `   ${String(r.t - a.timestamp).padStart(6)}ms ${tag.padEnd(16)} ${nameOf(r.id).padEnd(28)}` +
        (r.dmg ? ` ${String(r.dmg).padStart(7)}` : '') +
        (isMeteor ? '  <<< METEOR' : ''),
    );
  }
}
