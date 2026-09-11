import { describe, it, expect } from 'vitest';
import { MemoryCache } from '@wcl/storage';
import {
  MAX_HISTORY,
  SessionStore,
  toLlmMessages,
  type ChatSession,
} from '../src/session.js';
import type { AnalysisArtifact } from '../src/artifact.js';
import type { ComparisonView } from '../src/compare.js';

function makeSession(): ChatSession {
  return {
    pipeline: undefined,
    history: [],
    title: 'Test',
    updatedAt: 0,
  };
}

describe('SessionStore', () => {
  it('persists and reloads sessions through the KV store', async () => {
    const kv = new MemoryCache();
    const first = new SessionStore(kv);
    const session = makeSession();
    session.history.push({ role: 'user', content: 'hello' });
    await first.set('session-1', session);

    const second = new SessionStore(kv);
    await expect(second.get('session-1')).resolves.toEqual(session);
  });

  it('trims history to the configured context limit', async () => {
    const session = makeSession();
    for (let i = 0; i < MAX_HISTORY + 5; i += 1) {
      session.history.push({ role: 'user', content: String(i) });
    }
    const store = new SessionStore();
    await store.set('session-2', session);

    expect(session.history).toHaveLength(MAX_HISTORY);
    expect(session.history[0]?.content).toBe('5');
  });

  it('returns undefined for an unknown session', async () => {
    await expect(new SessionStore().get('missing')).resolves.toBeUndefined();
  });

  it('lists sessions newest first and removes them', async () => {
    const kv = new MemoryCache();
    const store = new SessionStore(kv);

    const a = makeSession();
    a.title = 'First';
    a.history.push({ role: 'user', content: 'a' });
    await store.set('s-a', a);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const b = makeSession();
    b.title = 'Second';
    b.history.push({ role: 'user', content: 'b' });
    await store.set('s-b', b);

    const list = await store.list();
    expect(list.map((s) => s.sessionId)).toEqual(['s-b', 's-a']);
    expect(list[0]?.title).toBe('Second');
    expect(list[0]?.messageCount).toBe(1);

    await store.remove('s-b');
    const after = await store.list();
    expect(after.map((s) => s.sessionId)).toEqual(['s-a']);
  });

  it('keeps the structured artifact alongside the text so reloads re-render', async () => {
    const kv = new MemoryCache();
    const session = makeSession();
    const artifact: AnalysisArtifact = {
      kind: 'analysis',
      run: {
        reportCode: 'ABC123',
        fightId: 8,
        playerId: 42,
        playerName: 'Hero',
      },
      findings: [],
    };
    session.history.push({
      role: 'assistant',
      content: '这场的主要问题是爆发延迟。',
      artifact,
      activity: [{ id: 'report', label: '读取 WCL 报告', status: 'done' }],
    });

    const store = new SessionStore(kv);
    await store.set('session-3', session);

    const reloaded = await new SessionStore(kv).get('session-3');
    expect(reloaded?.history[0]?.artifact).toEqual(artifact);
    expect(reloaded?.history[0]?.activity).toHaveLength(1);
  });

  it('keeps the comparison card alongside the text so reloads re-render', async () => {
    const kv = new MemoryCache();
    const store = new SessionStore(kv);
    const comparison: ComparisonView = {
      status: 'ok',
      notice: '同副本同专精的榜首实况',
      mine: { playerName: '我', keyLevel: 10 },
      rows: [],
      abilities: [{ name: '奥术飞弹', minePerMin: 12, theirsPerMin: 13.4 }],
      findingsOnlyMine: [],
      findingsShared: [],
    };
    await store.set('session-cmp', {
      pipeline: undefined,
      history: [{ role: 'assistant', content: '差在空转。', comparison }],
      title: 't',
      updatedAt: 0,
    });

    const reloaded = await new SessionStore(kv).get('session-cmp');
    expect(reloaded?.history[0]?.comparison).toEqual(comparison);
  });

  it('strips artifacts, activity and comparisons before the model sees the history', () => {
    const history = [
      { role: 'user' as const, content: '分析这场' },
      {
        role: 'assistant' as const,
        content: '有三个问题。',
        artifact: {
          kind: 'analysis' as const,
          run: { reportCode: 'A', fightId: 1, playerId: 1, playerName: 'H' },
          findings: [],
        },
        activity: [{ id: 'a', label: '步骤', status: 'done' as const }],
        comparison: {
          status: 'ok' as const,
          notice: 'n',
          mine: { playerName: 'H' },
          rows: [],
          abilities: [],
          findingsOnlyMine: [],
          findingsShared: [],
        },
      },
    ];

    expect(toLlmMessages(history)).toEqual([
      { role: 'user', content: '分析这场' },
      { role: 'assistant', content: '有三个问题。' },
    ]);
  });
});
