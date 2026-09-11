// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatCore, COMPARE_PROMPT } from '../../src/components/ChatCore';
import { getModule } from '../../src/modules';
import type { ChatViewState, ViewMessage } from '../../src/hooks/useChat';
import type { AnalysisArtifact, MessagePart } from '../../src/types';

const module = getModule('combat');
const llm = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-x', model: 'm' };

function text(text: string): MessagePart[] {
  return [{ type: 'text', text, isError: text.startsWith('（错误）') }];
}

function view(overrides?: Partial<ChatViewState>): ChatViewState {
  return {
    messages: [],
    options: [],
    isStreaming: false,
    error: null,
    ...overrides,
  };
}

function artifact(overrides?: Partial<AnalysisArtifact>): AnalysisArtifact {
  return {
    kind: 'analysis',
    run: {
      reportCode: 'ABC123',
      reportTitle: 'Raid',
      fightId: 8,
      fightName: 'Fight 8',
      durationMs: 192_000,
      playerId: 42,
      playerName: 'Hero',
      specName: 'Beast Mastery',
    },
    score: 82,
    reportUrl: 'https://cn.warcraftlogs.com/reports/ABC123#fight=8',
    findings: [
      {
        id: 'bm_hunter.cooldown_delay',
        category: 'cooldown',
        severity: 'high',
        title: '狂野怒火 使用存在延迟',
        description: '平均延迟 4.2s',
        verdict: 'suboptimal',
        confidence: 0.9,
        recommendation: '冷却就绪后尽快使用。',
        expected: { ability: '狂野怒火 (Bestial Wrath)', cooldownMs: 90_000 },
        actual: { casts: 3, avgDelayMs: 4200 },
        evidence: [
          { timestamp: 92_300, expectedAt: 88_100, ability: '狂野怒火 (Bestial Wrath)', value: 4200, unit: 'ms' },
        ],
      },
    ],
    reference: {
      encounterName: 'Mock Boss',
      metric: 'dps',
      className: 'Hunter',
      specName: 'Beast Mastery',
      count: 10,
      pool: '同副本历史最佳前 100 名',
      rankingsUrl: 'https://cn.warcraftlogs.com/zone/rankings/38#boss=2902',
      stats: { p50: 260_000 },
      player: { dps: 125_400, percentilePct: 42, gapVsP50Pct: -51.8 },
      topRuns: [
        {
          name: 'TopLog',
          amount: 312_000,
          keyLevel: 21,
          runUrl: 'https://cn.warcraftlogs.com/reports/rrr111#fight=4',
        },
      ],
    },
    rotation: {
      scenario: 'st',
      breakdown: { correct: 80, suboptimal: 10, mistake: 5, unknown: 5 },
      decisionCount: 100,
      knowledgeVersion: '1.0.0',
      samples: [],
    },
    ...overrides,
  };
}

function assistant(parts: MessagePart[]): ViewMessage {
  return { role: 'assistant', parts };
}

describe('ChatCore', () => {
  it('shows the welcome screen with the module quick-start chip', () => {
    const onSend = vi.fn();
    render(
      <ChatCore
        module={module}
        view={view()}
        llm={llm}
        onSend={onSend}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByText('WCL AI 战斗分析')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: module.sample }));
    expect(onSend).toHaveBeenCalledWith(module.sample);
  });

  it('renders user messages as plain text and assistant markdown as html', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [
            { role: 'user', parts: text('分析这个 https://wcl.example') },
            { role: 'assistant', parts: text('**要点**：GCD 空转偏高') },
          ],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByText('分析这个 https://wcl.example')).toBeDefined();
    const strong = document.querySelector('.msg-body strong');
    expect(strong?.textContent).toBe('要点');
  });

  it('marks error replies with the error class', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [assistant(text('（错误）配置缺失'))],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(document.querySelector('.message.error')).not.toBeNull();
  });

  it('renders options and forwards the picked value', () => {
    const onPick = vi.fn();
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [assistant(text('选一场战斗：'))],
          options: [
            { label: '8. 高阶督军', value: '8' },
            { label: '1. 拉夏南', value: '1' },
          ],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={onPick}
        onOpenFinding={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '8. 高阶督军' }));
    expect(onPick).toHaveBeenCalledWith('8');
  });

  it('renders the structured artifact instead of a wall of markdown', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [assistant([{ type: 'artifact', artifact: artifact() }])],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    // Run header + score come from the deterministic artifact.
    expect(screen.getByText('Fight 8')).toBeDefined();
    expect(screen.getByText('82')).toBeDefined();
    // The finding is a clickable card, not a paragraph.
    expect(screen.getByText('狂野怒火 使用存在延迟')).toBeDefined();
    expect(screen.getByText('爆发 / CD')).toBeDefined();
    // `expectedAt`/`timestamp` are rendered as mm:ss.s clock values.
    expect(screen.getByText('01:32.3')).toBeDefined();
  });

  it('keeps the reference baseline honest and linked', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [assistant([{ type: 'artifact', artifact: artifact() }])],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByText('与高分玩家对比')).toBeDefined();
    // The gap is quoted as-is from the engine — never recomputed here.
    expect(screen.getByText('-51.8%')).toBeDefined();
    // The pool size is stated, so "前 100 名" can never be implied.
    expect(screen.getByText(/前 10 名/)).toBeDefined();
    const rankings = screen.getByRole('link', { name: /榜单总览/ });
    expect(rankings.getAttribute('href')).toContain('/zone/rankings/38');
    expect(rankings.getAttribute('rel')).toContain('noopener');
    // Each pool run gets its own permalink. (Anchored so it does not also
    // match the artifact's own "查看本场原始日志 ↗" link.)
    const runLink = screen.getByRole('link', { name: /^日志/ });
    expect(runLink.getAttribute('href')).toContain('/reports/rrr111#fight=4');
  });

  it('lists the first runs inline and expands the rest of the pool', () => {
    const runs = Array.from({ length: 10 }, (_, i) => ({
      name: `Runner${i + 1}`,
      amount: 300_000 - i * 1000,
      keyLevel: 21,
      runUrl: `https://cn.warcraftlogs.com/reports/run${i + 1}#fight=1`,
    }));
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [
            assistant([
              {
                type: 'artifact',
                artifact: artifact({
                  reference: { ...artifact().reference!, count: 10, topRuns: runs },
                }),
              },
            ]),
          ],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    // Progressive disclosure: three inline, the remaining seven one click away.
    expect(screen.getByText('Runner1')).toBeDefined();
    expect(screen.getByText('Runner3')).toBeDefined();
    expect(screen.queryByText('Runner4')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /展开剩余 7 条/ }));
    expect(screen.getByText('Runner10')).toBeDefined();
    expect(screen.getByRole('button', { name: '收起' })).toBeDefined();
  });

  it('collapses activity by default and expands on click', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [
            assistant([
              {
                type: 'activity',
                steps: [
                  { id: 'report', label: '读取 WCL 报告', status: 'done', detail: 'Raid' },
                  { id: 'analyze', label: '分析 Hero 的战斗数据', status: 'done', detail: '3 条发现' },
                ],
              },
            ]),
          ],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByText('已完成 2 个分析步骤')).toBeDefined();
    // Steps are hidden until the user asks for them.
    expect(screen.queryByText('读取 WCL 报告')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /已完成 2 个分析步骤/ }));
    expect(screen.getByText('读取 WCL 报告')).toBeDefined();
    expect(screen.getByText('3 条发现')).toBeDefined();
  });

  it('surfaces a running step while the pipeline works', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [
            assistant([
              {
                type: 'activity',
                steps: [{ id: 'report', label: '读取 WCL 报告', status: 'running' }],
              },
            ]),
          ],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByText('读取 WCL 报告')).toBeDefined();
    expect(document.querySelector('.activity-dot.running')).not.toBeNull();
  });

  it('renders the head-to-head comparison part and sends the compare prompt', () => {
    const onSend = vi.fn();
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [
            assistant([
              { type: 'artifact', artifact: artifact() },
              {
                type: 'comparison',
                comparison: {
                  status: 'ok',
                  notice: '同副本同专精的榜首实况',
                  target: {
                    name: 'Qingxingood',
                    rank: 1,
                    keyLevel: 21,
                    amount: 305_872,
                    runUrl: 'https://cn.warcraftlogs.com/reports/DYK#fight=28',
                  },
                  mine: { playerName: 'Hero', keyLevel: 10 },
                  rows: [],
                  abilities: [],
                  findingsOnlyMine: [],
                  findingsShared: [],
                },
              },
              { type: 'text', text: '你主要差在空转。', isError: false },
            ]),
          ],
        })}
        llm={llm}
        onSend={onSend}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByText('榜首逐场对标')).toBeDefined();
    // The compare button on the baseline card drives the same turn the user
    // could type by hand — no hidden API path.
    fireEvent.click(screen.getByText(/与榜首逐场对比/));
    expect(onSend).toHaveBeenCalledWith(COMPARE_PROMPT);
  });

  it('orders parts activity → artifact → prose', () => {
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [
            assistant([
              { type: 'activity', steps: [{ id: 'a', label: '步骤', status: 'done' }] },
              { type: 'artifact', artifact: artifact() },
              { type: 'text', text: '这场的主要问题是爆发延迟。', isError: false },
            ]),
          ],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    const message = document.querySelector('.message.assistant');
    const order = [...(message?.children ?? [])].map((el) => el.className);
    expect(order[0]).toContain('activity');
    expect(order[1]).toContain('artifact');
    expect(order[2]).toContain('msg-body');
  });

  it('opens the finding drawer when a card is clicked', () => {
    const onOpenFinding = vi.fn();
    render(
      <ChatCore
        module={module}
        view={view({
          messages: [assistant([{ type: 'artifact', artifact: artifact() }])],
        })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={onOpenFinding}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /狂野怒火 使用存在延迟/ }));
    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    const opened = onOpenFinding.mock.calls[0]?.[0] as { id: string } | undefined;
    expect(opened?.id).toBe('bm_hunter.cooldown_delay');
  });

  it('submits on Enter, ignores Shift+Enter, and clears the composer', () => {
    const onSend = vi.fn();
    render(
      <ChatCore
        module={module}
        view={view()}
        llm={llm}
        onSend={onSend}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    const composer = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: '帮我分析' } });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('帮我分析');
    expect(composer.value).toBe('');
  });

  it('disables the composer and send button while streaming', () => {
    render(
      <ChatCore
        module={module}
        view={view({ isStreaming: true })}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByRole('textbox')).toHaveProperty('disabled', true);
    expect(screen.getByTitle('发送')).toHaveProperty('disabled', true);
  });

  it('keeps the send button disabled for empty input', () => {
    render(
      <ChatCore
        module={module}
        view={view()}
        llm={llm}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(screen.getByTitle('发送')).toHaveProperty('disabled', true);
  });

  it('prompts for LLM settings in the placeholder when the config is empty', () => {
    render(
      <ChatCore
        module={module}
        view={view()}
        llm={{ baseUrl: '', apiKey: '', model: '' }}
        onSend={() => {}}
        onPick={() => {}}
        onOpenFinding={() => {}}
      />,
    );

    expect(
      screen.getByPlaceholderText(
        '请先在「设置」中填写 LLM Base URL / API Key / 模型',
      ),
    ).toBeDefined();
  });
});
