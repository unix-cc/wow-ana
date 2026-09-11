/**
 * Live end-to-end check of the new SSE contract: activity steps + structured
 * artifact, streamed from the running server at :8787.
 *
 * Uses a real M+ report so the artifact carries findings, a reference baseline
 * and the external links. The LLM stage is expected to fail (no key supplied)
 * — that is fine and deliberate: the point is that activity + artifact arrive
 * *before* the model is ever called, and that the structured data is complete.
 */
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
const sessionId = `probe-${Date.now()}`;

const states = {
  reportUrl: 'https://cn.warcraftlogs.com/reports/fXdMjWKJbpna6yHv?fight=13&type=damage-done',
  player: '路鸣泽',
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
    return;
  }
  const text = await res.text();
  const events = text
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => {
      try {
        return JSON.parse(chunk.slice(5).trim());
      } catch {
        return undefined;
      }
    })
    .filter(Boolean);

  console.log(`\n===== ${label} =====`);
  const activity = [];
  let artifact;
  let deltas = 0;
  let replyKind;
  for (const event of events) {
    if (event.type === 'activity') activity.push(event.step);
    else if (event.type === 'artifact') artifact = event.artifact;
    else if (event.type === 'delta') deltas += 1;
    else if (event.type === 'reply') replyKind = event.kind;
  }

  console.log(`events: ${events.length} · activity: ${activity.length} · deltas: ${deltas} · reply: ${replyKind ?? '-'}`);
  for (const step of activity) {
    console.log(`  [${step.status.padEnd(7)}] ${step.label}${step.detail ? ` — ${step.detail}` : ''}`);
  }

  if (artifact) {
    const a = artifact;
    console.log(`\n  artifact: ${a.run.playerName} · ${a.run.fightName} · 分数 ${a.score ?? '-'}`);
    console.log(`  本场链接: ${a.reportUrl}`);
    console.log(`  findings: ${a.findings.length}`);
    for (const f of a.findings.slice(0, 4)) {
      const t = f.evidence[0]?.timestamp;
      console.log(`    [${f.severity}] ${f.title}${t !== undefined ? `  @${Math.round(t / 1000)}s` : ''}`);
    }
    if (a.reference) {
      console.log(`  基线池: ${a.reference.pool ?? '-'}`);
      console.log(`  层级: 本场 +${a.reference.keyLevel} / 池 +${a.reference.poolLevels?.min}~+${a.reference.poolLevels?.max}`);
      console.log(`  与池中位差距: ${a.reference.player?.gapVsP50Pct}%`);
      console.log(`  榜单链接: ${a.reference.rankingsUrl}`);
      const runs = a.reference.topRuns ?? [];
      console.log(`  榜首实况: ${runs.length} 条（带链接 ${runs.filter((r) => r.runUrl).length} 条）`);
      for (const r of runs.slice(0, 3)) {
        console.log(`    ${r.name} +${r.keyLevel} ${Math.round(r.amount)} → ${r.runUrl}`);
      }
    }
    if (a.rotation) {
      console.log(`  循环判定: ${JSON.stringify(a.rotation.breakdown)}`);
    }
  }
  return artifact;
}

await turn(states.reportUrl, 'turn 1 · 贴链接');
await turn('13', 'turn 2 · 选战斗');
const artifact = await turn(states.player, 'turn 3 · 选玩家 → 分析');

// Reload the session the way the UI does, to prove the cards survive a refresh.
const sessions = await (await fetch(`${BASE}/api/sessions/${sessionId}`)).json();
const withArtifact = (sessions.messages ?? []).filter((m) => m.artifact);
const withActivity = (sessions.messages ?? []).filter((m) => m.activity?.length);
console.log('\n===== 刷新后持久化 =====');
console.log(`messages: ${(sessions.messages ?? []).length}`);
console.log(`带 artifact 的消息: ${withArtifact.length}`);
console.log(`带 activity 的消息: ${withActivity.length}`);
console.log(`artifact 里 findings 仍为: ${withArtifact[0]?.artifact?.findings?.length ?? '-'}`);
