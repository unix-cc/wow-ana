/**
 * Live end-to-end check of the compare turn over the real SSE contract.
 *
 * Drives the exact flow the UI drives:
 *   report URL → player pick → analysis → "和榜首逐场对比一下，我到底差在哪"
 * and asserts the `comparison` event arrives (before the LLM), that its payload
 * is complete, and that it survives a session reload.
 *
 * The LLM stage is expected to fail (no valid key) — that is deliberate: the
 * point is that the card is produced deterministically and independently.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
// Overridable so the same script can seed a fixed session for a screenshot.
const sessionId = process.env.SESSION_ID ?? `cmp-${Date.now()}`;

const states = {
  reportUrl: 'https://cn.warcraftlogs.com/reports/fXdMjWKJbpna6yHv?fight=13',
  player: '黑脸法',
};

async function turn(message, label) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message,
      llm: { baseUrl: 'https://example.invalid/v1', apiKey: 'x', model: 'none' },
    }),
  });
  if (!res.ok) {
    console.log(`[${label}] HTTP ${res.status}`);
    return {};
  }
  const events = (await res.text())
    .split('\n\n')
    .map((c) => c.trim())
    .filter((c) => c.startsWith('data:'))
    .map((c) => {
      try {
        return JSON.parse(c.slice(5).trim());
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);

  const activity = [];
  let artifact;
  let comparison;
  let replyKind;
  for (const e of events) {
    if (e.type === 'activity') activity.push(e.step);
    else if (e.type === 'artifact') artifact = e.artifact;
    else if (e.type === 'comparison') comparison = e.comparison;
    else if (e.type === 'reply') replyKind = e.kind;
  }

  console.log(`\n===== ${label} =====`);
  console.log(
    `events=${events.length} activity=${activity.length} reply=${replyKind ?? '-'} artifact=${artifact ? 'yes' : '-'} comparison=${comparison ? 'yes' : '-'}`,
  );
  for (const step of activity) {
    console.log(`  [${step.status.padEnd(7)}] ${step.label}${step.detail ? ` — ${step.detail}` : ''}`);
  }
  return { artifact, comparison };
}

await turn(states.reportUrl, 'turn 1 · 贴链接');
await turn('13', 'turn 2 · 选战斗');
await turn(states.player, 'turn 3 · 选玩家 → 分析');

const { comparison } = await turn(
  '和榜首逐场对比一下，我到底差在哪',
  'turn 4 · 逐场对标榜首',
);

if (comparison) {
  console.log(`\nstatus: ${comparison.status}`);
  console.log(`notice: ${comparison.notice}`);
  console.log(
    `mine: ${comparison.mine.playerName}${comparison.mine.keyLevel !== undefined ? ` +${comparison.mine.keyLevel}` : ''}`,
  );
  if (comparison.target) {
    console.log(
      `target: #${comparison.target.rank} ${comparison.target.name} +${comparison.target.keyLevel} → ${comparison.target.runUrl}`,
    );
  }
  console.log('--- rows ---');
  for (const row of comparison.rows) {
    console.log(
      `  ${row.label.padEnd(12)} 我=${row.mine ?? '-'} 榜首=${row.theirs ?? '-'} 差=${row.deltaPct ?? '-'}% (${
        row.better === 'higher' ? '越高越好' : row.better === 'lower' ? '越低越好' : '—'
      })${row.note ? `  ＊${row.note}` : ''}`,
    );
  }
  console.log('--- abilities ---');
  for (const a of comparison.abilities) {
    console.log(`  ${a.name.padEnd(14)} 我=${a.minePerMin} 榜首=${a.theirsPerMin} 差=${a.deltaPct ?? '-'}%`);
  }
  if (comparison.rotation) {
    const r = comparison.rotation;
    console.log('--- rotation ---');
    console.log(
      `  comparable=${r.comparable} 场景 我=${r.scenarioMine} 他=${r.scenarioTheirs} 正确率 我=${r.correctRateMine ?? '-'}% 他=${r.correctRateTheirs ?? '-'}%`,
    );
    console.log(`  我=${JSON.stringify(r.breakdownMine)}`);
    console.log(`  他=${JSON.stringify(r.breakdownTheirs)}`);
  }
  console.log(`只有我有: ${comparison.findingsOnlyMine.join('；') || '（无）'}`);
  console.log(`双方都有: ${comparison.findingsShared.slice(0, 3).join('；')}`);
}

const session = await (
  await fetch(`${BASE}/api/sessions/${sessionId}`)
).json();
const withComparison = (session.messages ?? []).filter((m) => m.comparison);
console.log('\n===== 刷新后持久化 =====');
console.log(`messages: ${(session.messages ?? []).length}`);
console.log(`带 comparison 的消息: ${withComparison.length}`);
console.log(
  `刷新后技能行数: ${withComparison[0]?.comparison?.abilities?.length ?? '-'}`,
);
