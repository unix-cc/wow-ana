import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { logger } from '@wcl/shared';
import { AppService, DatabaseService, buildWclClient, type FightDeathReview } from '@wcl/application';
import { buildReportUrl } from '@wcl/wcl-client';
import { buildBrief, buildUserContent } from '@wcl/ai-reasoning';
import { loadWebConfig } from './config.js';
import {
  processTurn,
  type AnalysisPayload,
  type FightContext,
  type TurnReply,
} from './pipeline.js';
import { streamChat, validateLlmConfig, type ChatMessage } from './llm.js';
import { SessionStore, toLlmMessages, type ChatSession } from './session.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { buildAnalysisArtifact, type ActivityStep, type AnalysisArtifact } from './artifact.js';
import { buildComparisonView, type ComparisonView } from './compare.js';
import {
  buildComparisonUserMessage,
  buildMultiComparisonUserMessage,
} from './compare-prompt.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));
// React front end (Vite build output). Preferred when present; the legacy
// hand-written `public/` UI is kept as a fallback so the server still works
// without a front-end build.
const WEB_UI_DIST = fileURLToPath(new URL('../../web-ui/dist', import.meta.url));
const FRONTEND_DIR = existsSync(WEB_UI_DIST) ? WEB_UI_DIST : PUBLIC_DIR;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const ChatRequestSchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(8000),
  llm: z.object({
    baseUrl: z.string().max(500),
    apiKey: z.string().max(500),
    model: z.string().max(200),
  }),
});

export interface WebServerContext {
  service: AppService;
  database: DatabaseService | undefined;
  sessions: SessionStore;
}

/** Compose the web backend: cache + WCL client + application service. */
export function buildWebContext(): WebServerContext {
  const database = new DatabaseService();
  const client = buildWclClient({ cache: database.cache });
  const service = new AppService(client, database.cache);
  return { service, database, sessions: new SessionStore(database.kv) };
}

/** Start the HTTP server and resolve once it is listening. */
export async function startWebServer(): Promise<void> {
  const config = loadWebConfig();
  const context = buildWebContext();
  const server = createServer((req, res) => {
    void handleRequest(req, res, context);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      logger.info(
        `WCL web server listening on http://${config.host}:${config.port}`,
      );
      resolve();
    });
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  context: WebServerContext,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    await handleChat(req, res, context);
    return;
  }

  if (url.pathname === '/api/sessions') {
    if (req.method === 'GET') {
      await handleListSessions(res, context);
    } else {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
    }
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/sessions/')) {
    await handleGetSession(url.pathname, res, context);
    return;
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/api/sessions/')) {
    await handleDeleteSession(url.pathname, res, context);
    return;
  }

  if (req.method === 'GET') {
    const pathname =
      url.pathname === '/' || url.pathname === '/index.html'
        ? '/index.html'
        : url.pathname;
    await serveStatic(pathname, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
}

async function handleListSessions(
  res: ServerResponse,
  context: WebServerContext,
): Promise<void> {
  const sessions = await context.sessions.list();
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ sessions }));
}

async function handleDeleteSession(
  pathname: string,
  res: ServerResponse,
  context: WebServerContext,
): Promise<void> {
  const id = decodeURIComponent(pathname.slice('/api/sessions/'.length));
  await context.sessions.remove(id);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true }));
}

async function handleGetSession(
  pathname: string,
  res: ServerResponse,
  context: WebServerContext,
): Promise<void> {
  const id = decodeURIComponent(pathname.slice('/api/sessions/'.length));
  const session = await context.sessions.get(id);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ messages: session?.history ?? [] }));
}

async function serveStatic(
  pathname: string,
  res: ServerResponse,
): Promise<void> {
  const resolved = join(FRONTEND_DIR, pathname);
  if (!resolved.startsWith(FRONTEND_DIR + sep) && resolved !== FRONTEND_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  // SPA fallback: for paths without a file extension (or "/"), replay the
  // entry HTML so client-side navigation works even without file exists.
  const hasExtension = extname(decodeURIComponent(pathname)) !== '';
  const candidates = hasExtension ? [resolved] : [resolved, join(FRONTEND_DIR, 'index.html')];

  for (const file of candidates) {
    try {
      const content = await readFile(file);
      const mime = MIME[extname(file)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(content);
      return;
    } catch {
      // try next candidate
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

async function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
  context: WebServerContext,
): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJsonError(res, '请求体不是有效的 JSON');
    return;
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJsonError(res, '参数不正确');
    return;
  }
  const { sessionId, message, llm } = parsed.data;

  const configError = validateLlmConfig(llm);
  if (configError) {
    sendJsonError(res, configError);
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event: Record<string, unknown>): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const session: ChatSession = (await context.sessions.get(sessionId)) ?? {
    pipeline: undefined,
    history: [],
    title: '',
    updatedAt: Date.now(),
  };
  if (!session.title) {
    session.title = makeSessionTitle(message);
  }
  session.history.push({ role: 'user', content: message });

  // Codex-style activity: every deterministic stage reports running → done so
  // the UI can show real progress ("8 场战斗", "3 条发现") instead of an
  // opaque spinner. Collected here so a reloaded session keeps its steps.
  const activity: ActivityStep[] = [];
  const onActivity = (step: ActivityStep): void => {
    const index = activity.findIndex((s) => s.id === step.id);
    if (index >= 0) activity[index] = step;
    else activity.push(step);
    send({ type: 'activity', step });
  };

  let outcome: Awaited<ReturnType<typeof processTurn>>;
  try {
    outcome = await processTurn({
      session: session.pipeline,
      message,
      service: context.service,
      onActivity,
    });
  } catch (error) {
    logger.error('pipeline failed', error);
    session.history.push({
      role: 'assistant',
      content: `（错误）${safeMessage(error)}`,
      ...(activity.length > 0 ? { activity } : {}),
    });
    session.pipeline = undefined;
    await context.sessions.set(sessionId, session);
    send({ type: 'error', text: safeMessage(error) });
    res.end();
    return;
  }

  session.pipeline = outcome.session ?? session.pipeline;
  const reply = outcome.reply;

  switch (reply.kind) {
    case 'guidance':
    case 'ask-fight':
    case 'ask-player':
    case 'error':
      send({ type: 'reply', ...reply });
      session.history.push({
        role: 'assistant',
        content: reply.text,
        ...(activity.length > 0 ? { activity } : {}),
      });
      break;
    case 'followup':
      await streamLlmAndRecord({
        llm,
        session,
        extraUserMessage: undefined,
        send,
        activity,
      });
      break;
    case 'analysis': {
      // The structured side of the turn: emitted *before* the LLM starts
      // streaming, so the cards are on screen while the prose is still
      // arriving. Built from the deterministic result — never model output.
      const artifact = buildAnalysisArtifact(reply.analysis, {
        reportUrl: buildReportUrl(reply.analysis.report.code, reply.analysis.fight.id),
        rotation: reply.analysis.rotation,
      });
      send({ type: 'artifact', artifact });
      await streamLlmAndRecord({
        llm,
        session,
        extraUserMessage: buildAnalysisUserMessage(reply.analysis, message),
        send,
        activity,
        artifact,
      });
      break;
    }
    case 'death-review': {
      const ctx = fightContextOf(session.pipeline);
      if (!ctx) {
        const text =
          '还没有可选的战斗：先把 WCL 报告链接发给我并选好一场战斗，我再帮你复盘死亡 / 团灭 / 引怪情况。';
        send({ type: 'reply', kind: 'guidance', text });
        session.history.push({
          role: 'assistant',
          content: text,
          ...(activity.length > 0 ? { activity } : {}),
        });
        break;
      }
      try {
        const review = await onActivityWrap(onActivity, () =>
          context.service.analyzeDeathReview(ctx.reportCode, {
            fightId: ctx.fightId,
          }),
        );
        await streamLlmAndRecord({
          llm,
          session,
          extraUserMessage: buildDeathReviewUserMessage(
            ctx,
            review,
            message,
          ),
          send,
          activity,
        });
      } catch (error) {
        logger.error('death review failed', error);
        session.history.push({
          role: 'assistant',
          content: `（错误）${safeMessage(error)}`,
          ...(activity.length > 0 ? { activity } : {}),
        });
        send({ type: 'error', text: safeMessage(error) });
      }
      break;
    }
    case 'compare': {
      // Find the run to compare *from*: the most recent analysed turn in this
      // conversation. The artifact carries the exact identity (report / fight /
      // player), which is all the comparison needs — the user's wording is not
      // re-parsed into coordinates.
      const analysed = [...session.history]
        .reverse()
        .find((entry) => entry.artifact !== undefined);
      const run = analysed?.artifact?.run;
      if (!run) {
        const text =
          '还没有可对比的分析结果：先把 WCL 链接发给我并完成一次分析，我就能帮你和同副本同专精的榜首逐场比对。';
        send({ type: 'reply', kind: 'guidance', text });
        session.history.push({
          role: 'assistant',
          content: text,
          ...(activity.length > 0 ? { activity } : {}),
        });
        break;
      }

      const label = `逐场对标榜首（对照 ${run.playerName} 这一场）`;
      onActivity({ id: 'compare', label, status: 'running' });
      let comparison: ComparisonView;
      try {
        const model = await context.service.compareToTopRun(run.reportCode, {
          fightId: run.fightId,
          playerId: run.playerId,
          rankIndex: 0,
        });
        comparison = buildComparisonView(model);
        onActivity({
          id: 'compare',
          label,
          status: model.status === 'ok' ? 'done' : 'failed',
          detail:
            model.status === 'ok'
              ? `对照 ${model.target?.name ?? '榜首'} · ${model.abilities.length} 个技能`
              : model.notice,
        });
      } catch (error) {
        logger.error('comparison failed', error);
        onActivity({ id: 'compare', label, status: 'failed', detail: safeMessage(error) });
        session.history.push({
          role: 'assistant',
          content: `（错误）${safeMessage(error)}`,
          ...(activity.length > 0 ? { activity } : {}),
        });
        send({ type: 'error', text: safeMessage(error) });
        break;
      }

      send({ type: 'comparison', comparison });
      await streamLlmAndRecord({
        llm,
        session,
        extraUserMessage: buildComparisonUserMessage(comparison, message),
        send,
        activity,
        comparison,
      });
      break;
    }
  }

  await context.sessions.set(sessionId, session);
  res.end();
}

/** Wrap a slow deterministic step so it shows up in the activity panel. */
async function onActivityWrap<T>(
  onActivity: (step: ActivityStep) => void,
  fn: () => Promise<T>,
): Promise<T> {
  onActivity({ id: 'death-review', label: '复盘死亡 / 团灭 / 引怪', status: 'running' });
  try {
    const value = await fn();
    onActivity({
      id: 'death-review',
      label: '复盘死亡 / 团灭 / 引怪',
      status: 'done',
    });
    return value;
  } catch (error) {
    onActivity({
      id: 'death-review',
      label: '复盘死亡 / 团灭 / 引怪',
      status: 'failed',
      detail: safeMessage(error),
    });
    throw error;
  }
}

async function streamLlmAndRecord(options: {
  llm: z.infer<typeof ChatRequestSchema>['llm'];
  session: ChatSession;
  extraUserMessage: string | undefined;
  send: (event: Record<string, unknown>) => void;
  activity?: ActivityStep[] | undefined;
  artifact?: AnalysisArtifact | undefined;
  comparison?: ComparisonView | undefined;
}): Promise<void> {
  const { llm, session, extraUserMessage, send, activity, artifact, comparison } =
    options;
  // Only role + text go to the model; artifacts/activity are render data.
  const history = toLlmMessages(SessionStore.trimHistory(session.history));

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  messages.push(...history);
  if (extraUserMessage !== undefined) {
    messages.push({ role: 'user', content: extraUserMessage });
  }

  send({ type: 'start' });
  let fullText = '';
  try {
    for await (const delta of streamChat(llm, messages)) {
      fullText += delta;
      send({ type: 'delta', text: delta });
    }
    send({ type: 'done' });
  } catch (error) {
    logger.error('llm stream failed', error);
    fullText = `（错误）${safeMessage(error)}`;
    send({ type: 'error', text: safeMessage(error) });
  } finally {
    session.history.push({
      role: 'assistant',
      content: fullText,
      ...(activity !== undefined && activity.length > 0 ? { activity } : {}),
      ...(artifact !== undefined ? { artifact } : {}),
      ...(comparison !== undefined ? { comparison } : {}),
    });
  }
}

/**
 * Build the analysis user message. The deterministic result is run through
 * the ai-reasoning brief so the model receives a bounded, source-tagged
 * projection — raw events never enter the prompt and oversized evidence /
 * metric payloads are trimmed before serialization.
 */
function buildAnalysisUserMessage(
  payload: AnalysisPayload,
  originalMessage: string,
): string {  const { report, fight, player, summary, result } = payload;
  const head = [
    `请分析以下 WCL 战斗。用户原话：「${originalMessage}」`,
    `- 报告：${report.title ?? report.code}`,
    `- 战斗：${fight.name ?? `Fight ${fight.id}`}`,
    `- 玩家：${summary?.name ?? player.name}${
      summary?.spec ? `（${summary.spec}）` : ''
    }`,
    `- 总体分：${result.score?.overall ?? '-'}`,
  ].join('\n');

  const brief = buildBrief(
    {
      findings: result.findings,
      metrics: result.metrics,
      score: result.score,
      reference: result.reference,
      meta: {
        playerName: summary?.name ?? player.name,
        specName: summary?.spec,
        fightName: fight.name,
        durationMs:
          fight.endTime !== undefined && fight.startTime !== undefined
            ? Math.max(0, fight.endTime - fight.startTime)
            : undefined,
        reportTitle: report.title,
        // Permalink to the analyzed run itself — the "本场" link the AI cites.
        reportUrl: buildReportUrl(report.code, fight.id),
      },
    },
    { maxFindings: 16, maxEvidencePerFinding: 4 },
  );
  return `${head}\n\n${buildUserContent(brief)}`;
}

/**
 * Build the comparison user message (Phase AF).
 *
 * The model's job here is *narration only*: every number, rate and percentage
 * below was computed by the engine, and the caveats (different key levels,
 * different scenarios) are stated so the model cannot turn the table into a
 * population percentile or a "you are X% worse" verdict.
 */

/** Lift the fight context (reportCode/fight/players) out of a session state. */
function fightContextOf(
  pipeline: { stage: string } | undefined,
): FightContext | undefined {
  if (!pipeline) return undefined;
  if (pipeline.stage === 'ask-fight') return undefined;
  const ctx = pipeline as unknown as FightContext;
  return ctx.fightId !== undefined && ctx.reportCode !== undefined
    ? ctx
    : undefined;
}

/**
 * Build the death / wipe / add review user message. The review is fully
 * deterministic (Phase O): every number comes from the incident summaries, so
 * the model explains evidence rather than inventing damage values or blame.
 */
function buildDeathReviewUserMessage(
  ctx: FightContext,
  review: FightDeathReview,
  originalMessage: string,
): string {
  const head = [
    `请复盘本次战斗的死亡 / 团灭 / 引怪(ADD)情况。用户原话：「${originalMessage}」`,
    `- 报告：${ctx.report.title ?? ctx.report.code}`,
    `- 战斗：${ctx.fight.name ?? `Fight ${ctx.fight.id}`}（全队视角）`,
    `- 共 ${review.deaths.length} 次死亡、${review.wipes.length} 次团灭、${review.adds.length} 条引怪候选`,
    '',
    '【死亡明细（含死亡前 8s 受击归因与有效治疗，数字均来自日志）】',
    review.deaths.length === 0
      ? '本场无人死亡。'
      : review.deaths
          .map((d) => {
            const healerDesc =
              d.healerDiedBefore !== undefined
                ? `〔治疗者 ${d.healerDiedBefore.playerName} 于 ${(
                    d.healerDiedBefore.diedMsBefore / 1000
                  ).toFixed(1)}s 前阵亡${d.healerDiedBefore.hadHealedVictim ? '（此前曾治疗该玩家）' : ''}〕`
                : d.healers.length > 0
                  ? `〔治疗来源：${d.healers
                      .slice(0, 2)
                      .map((h) => h.playerName ?? `#${h.playerId}`)
                      .join('、')}〕`
                  : '';
            const overhealDesc =
              d.healingReceived === 0 && d.healAttempts > 0
                ? `（${d.healAttempts} 次尝试全部过量 ${d.overhealInWindow.toLocaleString()}）`
                : d.overhealInWindow > 0
                  ? `（另有 ${d.overhealInWindow.toLocaleString()} 过量）`
                  : '';
            return (
              `- ${d.playerName}@${(d.relativeMs / 1000).toFixed(0)}s (${d.role}) [${d.cause}] ` +
              `受击 ${d.takenTotal.toLocaleString()} / 有效治疗 ${d.healingReceived.toLocaleString()}（${d.healCount} 次）${overhealDesc}${healerDesc} ${d.summary}`
            );
          })
          .join('\n'),
    '',
    '【团灭事件（按死亡时间聚类，≥3 人同波）】',
    review.wipes.length === 0
      ? '本场没有 3 人以上的同波团灭。'
      : review.wipes
          .map(
            (w) =>
              `- ${(w.startAtMs / 1000).toFixed(0)}s~${(w.endAtMs / 1000).toFixed(0)}s 团灭：${w.deaths
                .map((x) => `${x.playerName}(${x.role}@${(x.relativeMs / 1000).toFixed(0)}s)`)
                .join('、')}；首死 ${w.firstDeathPlayerName}`,
          )
          .join('\n'),
    '',
    '【引怪(ADD)候选（线索+置信度，不是铁定结论）】',
    review.adds.length === 0
      ? '死亡窗口内未发现「死亡前才被首次接触的新怪」。'
      : review.adds
          .map(
            (a) =>
              `- ${a.note} [confidence=${a.confidence}，mob=${a.mobName ?? `#${a.mobId}`}]`,
          )
          .join('\n'),
  ].join('\n');

  return (
    head +
    '\n\n请用中文回答；可以引用上面每一条数字与来源怪/技能。对 ADD 候选必须带「疑似」或按 confidence 措辞，不要在没有证据时武断指责某玩家。'
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) {
      throw new Error('body too large');
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  return JSON.parse(text) as unknown;
}

function sendJsonError(res: ServerResponse, message: string): void {
  res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: message }));
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Derive a short conversation title from the first user message. */
function makeSessionTitle(message: string): string {
  const urlMatch = message.match(
    /https?:\/\/[\w.-]*warcraftlogs\.com\/reports\/([A-Za-z0-9]+)/i,
  );
  if (urlMatch?.[1]) {
    return `WCL 分析 ${urlMatch[1]}`;
  }
  const singleLine = message.replace(/\s+/g, ' ').trim();
  return singleLine.length > 40 ? `${singleLine.slice(0, 40)}…` : singleLine;
}

export type { TurnReply };
