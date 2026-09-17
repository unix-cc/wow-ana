/**
 * Probe: burst-window feasibility — can we slice "burst windows" out of the
 * Condition→Action decision stream, and which knowledge cooldowns actually
 * show up as active self-auras?
 *
 * Usage:
 *   node scripts/_probe-burst-windows.mjs <reportCode> <fightId|last> [playerNameFilter]
 *
 * For every player whose spec has knowledge:
 *   1. replay the decision stream (evaluateRotation),
 *   2. list knowledge cooldowns and which keys ever appear in buffsActive,
 *   3. slice continuous active windows per key (burst candidates),
 *   4. print verdict distribution inside vs outside those windows.
 *
 * Read-only; events go through the SQLite cache.
 */
import { AuthManager, GraphqlClient, RateLimitManager, WclClient } from '../packages/wcl-client/dist/index.js';
import { AppService } from '../packages/application/dist/index.js';
import { createDefaultRegistry } from '../packages/spec-knowledge/dist/index.js';
import { evaluateRotation, buildObservedDecisions } from '../packages/analysis-engine/dist/index.js';

const reportCode = process.argv[2];
const fightArg = process.argv[3];
const nameFilter = process.argv[4];

if (!reportCode || !fightArg) {
  console.error('usage: node scripts/_probe-burst-windows.mjs <reportCode> <fightId|last> [playerFilter]');
  process.exit(1);
}

const auth = new AuthManager();
const graphql = new GraphqlClient({
  tokenProvider: auth,
  rateLimiter: new RateLimitManager(),
});
const client = new WclClient({ graphql });
const service = new AppService(client);
const registry = createDefaultRegistry();

const report = await client.getReport(reportCode);
const fights = await client.getFights(reportCode);
console.log(`report ${reportCode}: title="${report.title}" zone=${report.zone?.name ?? '?'} startTime(epoch)=${report.startTime}`);
console.log(`fights: ${fights.length}`);
for (const f of fights.slice(0, 40)) {
  console.log(`  #${f.id} ${f.name ?? '?'} start=${f.startTime} end=${f.endTime} dur=${(f.endTime - f.startTime) / 1000}s`);
}

const fightId = fightArg === 'last' ? fights[fights.length - 1].id : Number(fightArg);
const fight = fights.find((f) => f.id === fightId);
if (!fight) {
  console.error(`fight ${fightId} not found`);
  process.exit(1);
}
console.log(`\n>>> chosen fight #${fightId} "${fight.name ?? '?'}" (start=${fight.startTime}, ${(fight.endTime - fight.startTime) / 1000}s)`);

const players = await service.getPlayers(reportCode, fightId);
console.log(`players in fight: ${players.length}`);
for (const p of players) {
  console.log(`  #${p.id} ${p.name} — ${p.className ?? '?'}/${p.specName ?? '?'} (specId=${p.specId ?? '?'})`);
}

// ---- whole-fight buff scan: do burst-aura ids exist in the full feed at all?
// (probe finding: sourceId-filtered Buffs never carries burst auras like
//  Arcane Surge / Avatar — check unfiltered before concluding cast-anchoring)
const BURST_CANDIDATES = new Set([365350, 107574, 19574, 31884, 20572, 152277, 227847, 167105]);
let burstScanDone = false;
let burstScan = new Map();
try {
  const allBuffs = await client.getEvents({ reportCode, fightId, dataType: 'Buffs' });
  for (const e of allBuffs) {
    const id = e.abilityId ?? 0;
    if (BURST_CANDIDATES.has(id)) {
      burstScan.set(id, (burstScan.get(id) ?? 0) + 1);
    }
  }
  burstScanDone = true;
  console.log(`\nwhole-fight buff scan (all actors, n=${allBuffs.length}):`);
  if (burstScan.size === 0) console.log('  no burst-aura ids found anywhere');
  for (const [id, n] of burstScan) console.log(`  ${id}: ${n}`);
} catch (e) {
  console.log(`whole-fight buff scan failed: ${e.message}`);
}

// ---- players with knowledge coverage
const wanted = players.filter((p) => {
  if (nameFilter && !p.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
  const s = p.specName ?? '';
  return ['Beast Mastery', 'Arcane', 'Elemental', 'Blood', 'Retribution', 'Arms'].includes(s);
});
console.log(`\nknowledge-covered specs in this fight: ${wanted.length}`);
if (wanted.length === 0) {
  console.log('none — nothing to probe. pick a fight containing one of the 6 covered specs.');
  process.exit(0);
}

for (const player of wanted) {
  console.log(`\n${'='.repeat(78)}`);
  console.log(`=== ${player.name} (#${player.id}) ${player.className ?? '?'}/${player.specName ?? '?'} (specId=${player.specId ?? '?'})`);
  const resolved = registry.resolve(player, report.startTime + fight.startTime);
  if (!resolved) {
    console.log('  (no knowledge resolved)');
    continue;
  }
  console.log(`knowledge: ${resolved.meta?.specName ?? player.specName} v${resolved.meta?.knowledgeVersion ?? '?'}`);

  const events = await Promise.all([
    client.getPlayerCasts({ reportCode, fightId, sourceId: player.id }),
    client.getPlayerBuffs({ reportCode, fightId, sourceId: player.id }),
    client.getPlayerDamage({ reportCode, fightId, sourceId: player.id }),
    client.getEvents({ reportCode, fightId, dataType: 'Resources', sourceId: player.id }),
  ]);
  const context = { report, fight, player, events: events.flat() };

  const evalResult = evaluateRotation(context);
  const decisions = evalResult.result?.decisions ?? [];
  console.log(`decisions: ${decisions.length}  verdict=${JSON.stringify(evalResult.result?.breakdown ?? null)}  scenario=${evalResult.result?.scenario ?? 'n/a'}`);

  if (decisions.length === 0) {
    console.log('  no decisions — skip');
    continue;
  }

  // ---- observed stream carries the state snapshot (verdict stream does not)
  const replay = buildObservedDecisions({
    playerId: player.id,
    events: events.flat(),
    knowledge: resolved,
  });
  const verdictByTime = new Map(decisions.map((d) => [d.time, d]));
  const observed = replay.decisions.filter((d) => verdictByTime.has(d.time));
  console.log(`observed w/ state: ${observed.length} (verdict-matched ${observed.length})`);
  const withBurstState = (d) => d.state?.buffsActive ?? new Set();

  // ---- knowledge self-buff declarations
  const selfBuffs = [...resolved.buffs, ...resolved.debuffs].filter((b) => b.appliesTo === 'self');
  console.log(`\n  knowledge self-buffs (${selfBuffs.length}):`);
  for (const b of selfBuffs) {
    console.log(`    ${b.key} — ${b.name} (id=${b.abilityId ?? '?'}, stacks=${b.stacks ?? false})`);
  }

  // ---- raw buff events: which auras actually arrive from WCL?
  const buffEvents = await client.getPlayerBuffs({ reportCode, fightId, sourceId: player.id });  const byAbility = new Map();
  for (const e of buffEvents) {
    const id = e.abilityId ?? 0;
    byAbility.set(id, (byAbility.get(id) ?? 0) + 1);
  }
  const topEvents = [...byAbility.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  const selfById = new Map(selfBuffs.filter((b) => b.abilityId !== undefined).map((b) => [b.abilityId, b]));
  const cdById = new Map(resolved.cooldowns.filter((c) => c.abilityId !== undefined).map((c) => [c.abilityId, c]));
  console.log(`\n  raw buff events (top 25 by abilityId, n=${buffEvents.length}):`);
  for (const [id, n] of topEvents) {
    const tag = selfById.has(id) ? ' ← knowledge self-buff' : cdById.has(id) ? ' ← cooldown(no self-buff declared)' : '';
    console.log(`    ${id}: ${n}${tag}`);
  }

  // ---- raw cast events: which cooldown abilities were actually cast?
  const castEvents = await client.getPlayerCasts({ reportCode, fightId, sourceId: player.id });
  const castById = new Map();
  for (const e of castEvents) {
    castById.set(e.abilityId ?? 0, (castById.get(e.abilityId ?? 0) ?? 0) + 1);
  }
  const cdById2 = new Map(resolved.cooldowns.filter((c) => c.abilityId !== undefined).map((c) => [c.abilityId, c]));
  console.log(`\n  cast events: ${castEvents.length} total; cooldown abilities seen:`);
  for (const [id, cd] of [...cdById2.entries()].sort()) {
    const n = castById.get(id) ?? 0;
    console.log(`    ${cd.key} (${id}) ${cd.name}: cast ${n}x`);
  }

  // ---- cooldowns vs actually-observed self-auras
  console.log(`\n  cooldowns declared (kind / key / name):`);
  for (const cd of resolved.cooldowns) {
    console.log(`    [${cd.kind}] ${cd.key} — ${cd.name}`);
  }

  const seenBuffs = new Map();
  for (const d of observed) {
    for (const k of withBurstState(d)) {
      seenBuffs.set(k, (seenBuffs.get(k) ?? 0) + 1);
    }
  }
  const topBuffs = [...seenBuffs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`\n  self-aura keys seen in decision stream (top 15):`);
  for (const [k, n] of topBuffs) console.log(`    ${k}: ${n}`);

  // ---- per-key active windows (continuous buffsActive segments)
  for (const cd of resolved.cooldowns) {
    const key = cd.key;
    const active = observed.filter((d) => withBurstState(d).has(key));
    if (active.length === 0) {
      console.log(`\n  [${cd.kind}] ${key} (${cd.name}): never active in stream`);
      continue;
    }
    // slice continuous runs
    const windows = [];
    let start = active[0].time;
    let prev = active[0].time;
    for (let i = 1; i < active.length; i++) {
      const t = active[i].time;
      if (t - prev > 15000) {
        windows.push([start, prev]);
        start = t;
      }
      prev = t;
    }
    windows.push([start, prev]);
    console.log(`\n  [${cd.kind}] ${key} (${cd.name}): ${active.length} decisions in ${windows.length} window(s)`);
    for (const [ws, we] of windows) {
      const inWin = observed
        .filter((d) => d.time >= ws && d.time <= we + 2000)
        .map((d) => ({
          time: d.time,
          actualKey: d.actualKey,
          verdict: verdictByTime.get(d.time)?.verdict ?? '?',
        }));
      const verdicts = {};
      const actions = {};
      for (const d of inWin) {
        verdicts[d.verdict] = (verdicts[d.verdict] ?? 0) + 1;
        actions[d.actualKey] = (actions[d.actualKey] ?? 0) + 1;
      }
      const lenS = ((we - ws) / 1000).toFixed(1);
      console.log(`    win [${(ws / 1000).toFixed(1)}s .. ${(we / 1000).toFixed(1)}s] len=${lenS}s decisions=${inWin.length}`);
      console.log(`      verdict=${JSON.stringify(verdicts)}`);
      console.log(`      actions=${JSON.stringify(actions)}`);
    }
  }

  // ---- cast-anchored burst windows (probe: aura events are unreliable,
  // cast timestamps are not). duration is a placeholder until knowledge
  // declares burstDurationMs.
  const burstDurationByKey = new Map([
    ['arcane_surge', 8000], ['avatar', 20000], ['bestial_wrath', 15000],
    ['stormkeeper', 15000], ['divine_avenger', 20000], ['colossus_smash', 8000],
    ['dancing_rune_weapon', 12000], ['vampiric_blood', 10000],
  ]);
  const castAnchored = resolved.cooldowns
    .filter((cd) => cd.kind === 'offensive' && cd.abilityId !== undefined)
    .map((cd) => ({
      cd,
      casts: castEvents
        .filter((e) => e.abilityId === cd.abilityId)
        .map((e) => e.timestamp)
        .sort((a, b) => a - b),
      durationMs: burstDurationByKey.get(cd.key) ?? 8000,
    }));
  for (const { cd, casts, durationMs } of castAnchored) {
    if (casts.length === 0) continue;
    console.log(`\n  [cast-anchored] ${cd.key} (${cd.name}): ${casts.length} casts, window +${durationMs / 1000}s`);
    for (const t of casts) {
      const inWin = observed
        .filter((d) => d.time >= t && d.time <= t + durationMs)
        .map((d) => ({ key: d.actualKey, verdict: verdictByTime.get(d.time)?.verdict ?? '?' }));
      const v = {};
      const a = {};
      for (const d of inWin) {
        v[d.verdict] = (v[d.verdict] ?? 0) + 1;
        a[d.key] = (a[d.key] ?? 0) + 1;
      }
      console.log(`    cast @${(t / 1000).toFixed(1)}s: ${inWin.length} decisions verdict=${JSON.stringify(v)}`);
      console.log(`      actions=${JSON.stringify(a)}`);
    }
  }

  // ---- burst vs filler verdict split (first cooldown key with windows = burst proxy)
  const burstKey = resolved.cooldowns.find((cd) =>
    observed.some((d) => withBurstState(d).has(cd.key)),
  )?.key;
  if (burstKey) {
    const inBurst = [];
    const filler = [];
    for (const d of observed) {
      const verdict = verdictByTime.get(d.time)?.verdict;
      if (verdict === undefined) continue;
      if (withBurstState(d).has(burstKey)) inBurst.push({ ...d, verdict });
      else filler.push({ ...d, verdict });
    }
    const split = (list, label) => {
      const v = {};
      for (const d of list) v[d.verdict] = (v[d.verdict] ?? 0) + 1;
      const decided = list.filter((d) => d.verdict !== 'unknown').length;
      const correct = v.correct ?? 0;
      console.log(`  ${label}: n=${list.length} verdict=${JSON.stringify(v)} correctRate=${decided ? ((correct / decided) * 100).toFixed(1) : '-'}%`);
    };
    console.log(`\n  burst(${burstKey}) vs filler split:`);
    split(inBurst, `in-burst(${burstKey})`);
    split(filler, 'filler');
  }
}
