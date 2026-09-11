import type { Report, Fight, Player } from '@wcl/domain';
import type { AnalysisResult } from '@wcl/analysis-engine';
import type { AppService, PlayerSummary, RotationDigest } from '@wcl/application';
import { parseWclUrl } from '@wcl/wcl-client';
import type { ActivityStep } from './artifact.js';

const WCL_URL_RE =
  /https?:\/\/[\w.-]*warcraftlogs\.com\/reports\/[A-Za-z0-9]{1,32}(?:[?#][A-Za-z0-9=&%._~:@/-]*)?/i;

/** Common fields shared by the player-selection and ready states. */
export interface FightContext {
  reportCode: string;
  fightId: number;
  report: Report;
  fight: Fight;
  players: Player[];
}

export interface AskFightState {
  stage: 'ask-fight';
  reportCode: string;
  report: Report;
  fights: Fight[];
}

export interface AskPlayerState extends FightContext {
  stage: 'ask-player';
}

/** After an analysis: the fight context stays so the user can keep chatting. */
export interface ReadyState extends FightContext {
  stage: 'ready';
}

export type SessionState = AskFightState | AskPlayerState | ReadyState;

export interface AnalysisPayload {
  report: Report;
  fight: Fight;
  player: Player;
  summary: PlayerSummary | undefined;
  result: AnalysisResult;
  /** Condition→Action verdict digest, when the spec has live knowledge. */
  rotation?: RotationDigest | undefined;
}

export type TurnReply =
  | { kind: 'guidance'; text: string }
  | {
      kind: 'ask-fight';
      text: string;
      fights: Array<{ id: number; name: string }>;
    }
  | {
      kind: 'ask-player';
      text: string;
      players: Array<{ id: number; name: string; spec?: string | undefined }>;
    }
  | { kind: 'analysis'; analysis: AnalysisPayload }
  /** Whole-fight death / wipe / add review question (handled downstream). */
  | { kind: 'death-review' }
  /**
   * Head-to-head comparison against the ranked run (Phase AF). Downstream
   * because it needs the session history (to find the run being compared from)
   * rather than anything the pipeline state holds.
   */
  | { kind: 'compare' }
  /** No deterministic action; the LLM should answer from conversation memory. */
  | { kind: 'followup' }
  | { kind: 'error'; text: string };

/** Phrases that switch the conversation into death / wipe / add review mode. */
const DEATH_REVIEW_INTENTS = [
  '死亡原因',
  '为什么死',
  '怎么死',
  '为什么灭',
  '团灭',
  '灭团',
  '减员',
  '谁导致',
  '谁的责任',
  'add怪',
  'add了',
  '引到怪',
  '引怪',
  '谁add',
  '谁引',
  '复盘',
];

/** Heuristic: is this message asking about deaths / wipes / adds? */
export function isDeathReviewIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return DEATH_REVIEW_INTENTS.some((phrase) => lower.includes(phrase));
}

/**
 * Phrases that ask for a head-to-head comparison against the ranked run
 * (Phase AF). Kept separate from the death-review intent because the two take
 * very different code paths: this one re-analyses *another player's* fight.
 */
const COMPARE_INTENTS = [
  '对比榜首',
  '和榜首',
  '跟榜首',
  '与榜首',
  '对比第一',
  '和第一',
  '跟第一',
  '榜首对比',
  '横向对比',
  '对比一下',
  '差在哪',
  '差在哪里',
  '差距在哪',
  '哪里差',
  '我差',
  '对标',
];

/** Heuristic: is this message asking to compare against the top run? */
export function isCompareIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return COMPARE_INTENTS.some((phrase) => lower.includes(phrase));
}

const HELP_TEXT =
  '把 WCL 战斗日志链接发给我就能开始分析，例如：\n' +
  'https://www.warcraftlogs.com/reports/xxxx?fight=8\n' +
  '我会依次解析报告、选出要分析的玩家，然后生成分析报告。';

/** Extract a WCL report URL from free text. */
export function extractWclUrl(text: string): string | undefined {
  const match = text.match(WCL_URL_RE);
  return match?.[0];
}

/** Match a fight by "fight=N" (or a bare number), falling back to name. */
export function matchFight(fights: Fight[], text: string): Fight | undefined {
  const lower = text.trim().toLowerCase();
  const idMatch = lower.match(/(?:fight[=:]\s*)?(\d+)/);
  if (idMatch?.[1]) {
    const byId = fights.find((f) => String(f.id) === idMatch[1]);
    if (byId) return byId;
  }
  return fights.find(
    (f) => f.name !== undefined && lower.includes(f.name.toLowerCase()),
  );
}

/** Match a player by exact name first, then by substring. */
export function matchPlayer(
  players: Player[],
  text: string,
): Player | undefined {
  const lower = text.trim().toLowerCase();
  if (lower) {
    const exact = players.find((p) => p.name.toLowerCase() === lower);
    if (exact) return exact;
  }
  return players.find((p) => lower.includes(p.name.toLowerCase()));
}

export interface ProcessTurnInput {
  session: SessionState | undefined;
  message: string;
  service: AppService;
  /**
   * Progress reporter for the Codex-style activity panel. The pipeline is
   * deterministic and can take several seconds (WCL round-trips + event
   * paging), so each stage reports `running` then `done` — the UI shows a
   * collapsible step list instead of an opaque "thinking…".
   */
  onActivity?: ((step: ActivityStep) => void) | undefined;
}

export interface ProcessTurnResult {
  session: SessionState | undefined;
  reply: TurnReply;
}

/** Emit `running` + `done` for one step, returning a helper for the pair. */
function activityReporter(
  onActivity: ((step: ActivityStep) => void) | undefined,
): {
  run: <T>(
    id: string,
    label: string,
    fn: () => Promise<T>,
    detail: (value: T) => string | undefined,
  ) => Promise<T>;
  done: (id: string, label: string, detail?: string) => void;
  failed: (id: string, label: string, detail?: string) => void;
} {
  const emit = (
    id: string,
    label: string,
    status: ActivityStep['status'],
    detail?: string,
  ): void => {
    if (!onActivity) return;
    const step: ActivityStep = { id, label, status };
    if (detail !== undefined) step.detail = detail;
    onActivity(step);
  };

  return {
    async run(id, label, fn, detail) {
      emit(id, label, 'running');
      try {
        const value = await fn();
        emit(id, label, 'done', detail(value));
        return value;
      } catch (error) {
        emit(id, label, 'failed', messageOf(error));
        throw error;
      }
    },
    done: (id, label, detail) => emit(id, label, 'done', detail),
    failed: (id, label, detail) => emit(id, label, 'failed', detail),
  };
}

/**
 * Deterministic pipeline. Decides the next reply from the current session
 * state and the user's message; only `kind: 'analysis'` / `kind: 'followup'`
 * hand off to the LLM downstream. All data fetching and analysis is computed
 * here, never by the model.
 */
export async function processTurn(
  input: ProcessTurnInput,
): Promise<ProcessTurnResult> {
  const { session, message, service, onActivity } = input;
  const activity = activityReporter(onActivity);
  const url = extractWclUrl(message);

  if (session?.stage === 'ask-fight') {
    // A fresh report URL always restarts the flow, even mid selection.
    if (url) {
      return resolveReport(url, service, activity);
    }
    const fight = matchFight(session.fights, message);
    if (!fight) {
      return { session, reply: buildAskFight(session.report, session.fights) };
    }
    const players = await activity.run(
      'players',
      '读取参战名单',
      () => service.getPlayers(session.reportCode, fight.id),
      (list) => `${list.length} 人`,
    );
    const next: SessionState = {
      stage: 'ask-player',
      reportCode: session.reportCode,
      fightId: fight.id,
      report: session.report,
      fight,
      players,
    };
    return {
      session: next,
      reply: buildAskPlayer(session.report, fight, players),
    };
  }

  if (session?.stage === 'ask-player') {
    if (url) {
      return resolveReport(url, service, activity);
    }
    // Death / wipe review is whole-fight and needs no player pick.
    if (isDeathReviewIntent(message)) {
      return { session, reply: { kind: 'death-review' } };
    }
    const player = matchPlayer(session.players, message);
    if (!player) {
      return {
        session,
        reply: buildAskPlayer(session.report, session.fight, session.players),
      };
    }
    return analyzePlayerForContext(session, player, service, activity);
  }

  if (session?.stage === 'ready') {
    if (url) {
      return resolveReport(url, service, activity);
    }
    if (isDeathReviewIntent(message)) {
      return { session, reply: { kind: 'death-review' } };
    }
    const player = matchPlayer(session.players, message);
    if (player) {
      return analyzePlayerForContext(session, player, service, activity);
    }
    // Head-to-head against the ranked run (Phase AF). Deterministic and
    // expensive (it re-analyses another player's fight), so it is only reached
    // on an explicit ask — and only in `ready`, where the session already
    // carries an analysed run to compare from.
    if (isCompareIntent(message)) {
      return { session, reply: { kind: 'compare' } };
    }
    // General follow-up: the LLM answers from the conversation history.
    return { session, reply: { kind: 'followup' } };
  }

  if (!url) {
    return { session: undefined, reply: { kind: 'guidance', text: HELP_TEXT } };
  }
  return resolveReport(url, service, activity);
}

async function analyzePlayerForContext(
  ctx: FightContext,
  player: Player,
  service: AppService,
  activity: ReturnType<typeof activityReporter>,
): Promise<ProcessTurnResult> {
  const outcome = await activity.run(
    'analyze',
    `分析 ${player.name} 的战斗数据`,
    () =>
      service.analyzeFight(ctx.reportCode, {
        fightId: ctx.fightId,
        playerId: player.id,
      }),
    (value) => `${value.result.findings.length} 条发现 · 工程分 ${value.result.score?.overall ?? '-'}`,
  );
  const next: SessionState = {
    stage: 'ready',
    reportCode: ctx.reportCode,
    fightId: ctx.fightId,
    report: ctx.report,
    fight: ctx.fight,
    players: ctx.players,
  };
  return {
    session: next,
    reply: {
      kind: 'analysis',
      analysis: {
        report: ctx.report,
        fight: ctx.fight,
        player,
        summary: outcome.summary,
        result: outcome.result,
        ...(outcome.rotation !== undefined ? { rotation: outcome.rotation } : {}),
      },
    },
  };
}

async function resolveReport(
  url: string,
  service: AppService,
  activity: ReturnType<typeof activityReporter>,
): Promise<ProcessTurnResult> {
  let ref: ReturnType<typeof parseWclUrl>;
  try {
    ref = parseWclUrl(url);
  } catch (error) {
    return {
      session: undefined,
      reply: { kind: 'error', text: `无法解析链接：${messageOf(error)}` },
    };
  }

  const report = await activity.run(
    'report',
    '读取 WCL 报告',
    () =>
      service.getReport(ref.reportCode).catch((error) => {
        throw new Error(`获取报告失败：${messageOf(error)}`);
      }),
    (value) => value.title ?? value.code,
  );
  const fights = await activity.run(
    'fights',
    '解析战斗列表',
    () =>
      service.getFights(ref.reportCode).catch((error) => {
        throw new Error(`获取战斗列表失败：${messageOf(error)}`);
      }),
    (list) => `${list.length} 场战斗`,
  );
  if (fights.length === 0) {
    activity.failed('fights', '解析战斗列表', '报告里没有战斗记录');
    return {
      session: undefined,
      reply: { kind: 'error', text: '这个报告里没有战斗记录。' },
    };
  }

  if (ref.fightId !== undefined) {
    const fight = fights.find((f) => f.id === ref.fightId);
    if (!fight) {
      return {
        session: undefined,
        reply: { kind: 'error', text: `报告中找不到 fight=${ref.fightId}。` },
      };
    }
    const players = await activity.run(
      'players',
      '读取参战名单',
      () => service.getPlayers(ref.reportCode, fight.id),
      (list) => `${list.length} 人`,
    );
    const next: SessionState = {
      stage: 'ask-player',
      reportCode: ref.reportCode,
      fightId: fight.id,
      report,
      fight,
      players,
    };
    return { session: next, reply: buildAskPlayer(report, fight, players) };
  }

  const next: SessionState = {
    stage: 'ask-fight',
    reportCode: ref.reportCode,
    report,
    fights,
  };
  return { session: next, reply: buildAskFight(report, fights) };
}

function buildAskFight(report: Report, fights: Fight[]): TurnReply {
  const preview = fights
    .slice(0, 20)
    .map((f) => `${f.id}. ${f.name ?? `Fight ${f.id}`}`)
    .join('\n');
  const text =
    `报告「${report.title ?? report.code}」里有 ${fights.length} 场战斗：\n` +
    `${preview}\n\n` +
    `请选择要分析哪一场（回复编号或名称，例如「fight=8」）。`;
  return {
    kind: 'ask-fight',
    text,
    fights: fights.map((f) => ({ id: f.id, name: f.name ?? `Fight ${f.id}` })),
  };
}

function buildAskPlayer(
  report: Report,
  fight: Fight,
  players: Player[],
): TurnReply {
  const preview = players
    .slice(0, 30)
    .map((p) => `${p.name}${p.specName ? `（${p.specName}）` : ''}`)
    .join('、');
  const text =
    `报告「${report.title ?? report.code}」· 战斗「${fight.name ?? `Fight ${fight.id}`}」` +
    `里找到 ${players.length} 位玩家：\n${preview}\n\n` +
    `想分析哪个角色？直接回复角色名即可。`;
  return {
    kind: 'ask-player',
    text,
    players: players.map((p) => ({ id: p.id, name: p.name, spec: p.specName })),
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
