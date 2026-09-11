/**
 * Shared types for the web UI, mirroring the Node backend's SSE + session
 * API contracts (apps/web/src). Keep these in sync with the backend so the
 * "API 不改" guarantee holds — the front end only ever consumes these shapes.
 *
 * ## The message-parts model
 *
 * A chat message is **not** a string. It is an ordered list of parts, because
 * an analysis turn carries three different kinds of information:
 *
 *   - `text`      — the model's prose (Markdown). It explains, never computes.
 *   - `activity`  — what the deterministic pipeline actually did (Codex-style).
 *   - `artifact`  — the structured analysis (findings / reference / rotation),
 *                   rendered as cards instead of a wall of Markdown.
 *
 * Adding a new kind of result means adding a part type here and a renderer in
 * `ChatCore` — never a new page. See docs/ui-architecture.md.
 */

/** One chat message persisted by the session store. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Structured side of an analysis turn. */
  artifact?: AnalysisArtifact | undefined;
  /** Structured side of a head-to-head comparison turn (Phase AF). */
  comparison?: ComparisonView | undefined;
  /** Deterministic pipeline steps taken to produce this message. */
  activity?: ActivityStep[] | undefined;
}

/** A persisted conversation in the sidebar list. */
export interface SessionSummary {
  sessionId: string;
  title: string;
  updatedAt: number;
}

/** LLM settings the user supplies (stored only in the browser). */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/* ------------------------------------------------------------------ *
 * Structured analysis (mirrors apps/web/src/artifact.ts)
 * ------------------------------------------------------------------ */

export interface ActivityStep {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  detail?: string | undefined;
}

export interface ArtifactEvidence {
  timestamp?: number | undefined;
  expectedAt?: number | undefined;
  ability?: string | undefined;
  abilityId?: number | undefined;
  value?: number | undefined;
  unit?: string | undefined;
  note?: string | undefined;
}

export interface ArtifactFinding {
  id: string;
  category: string;
  severity: string;
  title: string;
  description?: string | undefined;
  verdict?: string | undefined;
  confidence?: number | undefined;
  recommendation?: string | undefined;
  expected?: Record<string, unknown> | undefined;
  actual?: Record<string, unknown> | undefined;
  evidence: ArtifactEvidence[];
  evidenceCapped?: boolean;
}

export interface ArtifactReference {
  encounterName: string;
  metric: string;
  className: string;
  specName: string;
  count: number;
  pool?: string | undefined;
  keyLevel?: number | undefined;
  poolLevels?: { min: number; max: number } | undefined;
  rankingsUrl?: string | undefined;
  stats: Partial<Record<'min' | 'p25' | 'p50' | 'p75' | 'p90' | 'max' | 'mean', number>>;
  player?:
    | {
        dps?: number | undefined;
        percentilePct?: number | undefined;
        gapVsP50Pct?: number | undefined;
      }
    | undefined;
  topRuns: Array<{
    name: string;
    amount: number;
    keyLevel?: number | undefined;
    runUrl?: string | undefined;
  }>;
}

export interface ArtifactRotation {
  scenario: 'st' | 'aoe' | 'unknown';
  breakdown: Record<string, number>;
  decisionCount: number;
  knowledgeVersion: string;
  samples: Array<{
    time: number;
    verdict: string;
    actualKey: string;
    expectedKey?: string | undefined;
  }>;
  engagements?: Array<{ startMs: number; endMs: number; decisions: number; flagged: number }>;
}

export interface AnalysisArtifact {
  kind: 'analysis';
  run: {
    reportCode: string;
    reportTitle?: string | undefined;
    fightId: number;
    fightName?: string | undefined;
    durationMs?: number | undefined;
    playerId: number;
    playerName: string;
    specName?: string | undefined;
  };
  score?: number | undefined;
  reportUrl?: string | undefined;
  findings: ArtifactFinding[];
  findingsCapped?: boolean;
  reference?: ArtifactReference | undefined;
  rotation?: ArtifactRotation | undefined;
}

/* ------------------------------------------------------------------ *
 * Head-to-head comparison (mirrors apps/web/src/compare.ts)
 * ------------------------------------------------------------------ */

export interface ComparisonRowView {
  key: string;
  label: string;
  unit: 'perMin' | 'pct' | 'amount' | 'number';
  mine?: number | undefined;
  theirs?: number | undefined;
  deltaPct?: number | undefined;
  better: 'higher' | 'lower' | 'neutral';
  note?: string | undefined;
}

export interface ComparisonView {
  status: 'ok' | 'no-reference' | 'player-not-found' | 'no-data';
  notice: string;
  target?:
    | {
        name: string;
        rank: number;
        keyLevel?: number | undefined;
        amount: number;
        runUrl?: string | undefined;
        reportCode?: string | undefined;
        fightId?: number | undefined;
      }
    | undefined;
  mine: {
    playerName: string;
    keyLevel?: number | undefined;
    durationMs?: number | undefined;
  };
  rows: ComparisonRowView[];
  abilities: Array<{
    name: string;
    minePerMin: number;
    theirsPerMin: number;
    deltaPct?: number | undefined;
  }>;
  rotation?:
    | {
        comparable: boolean;
        scenarioMine: string;
        scenarioTheirs: string;
        decisionCountMine: number;
        decisionCountTheirs: number;
        breakdownMine: Record<string, number>;
        breakdownTheirs: Record<string, number>;
        correctRateMine?: number | undefined;
        correctRateTheirs?: number | undefined;
      }
    | undefined;
  findingsOnlyMine: string[];
  findingsShared: string[];
}

/* ------------------------------------------------------------------ *
 * Render model: one message rendered as an ordered list of parts
 * ------------------------------------------------------------------ */

export type MessagePart =
  | { type: 'text'; text: string; isError: boolean }
  | { type: 'activity'; steps: ActivityStep[] }
  | { type: 'artifact'; artifact: AnalysisArtifact }
  | { type: 'comparison'; comparison: ComparisonView };

/* ------------------------------------------------------------------ *
 * SSE chat events (see apps/web/src/server.ts handleChat + pipeline.ts)
 * ------------------------------------------------------------------ */

/** Reply kinds produced by the deterministic turn pipeline. */
export type TurnReply =
  | { kind: 'guidance'; text: string }
  | { kind: 'ask-fight'; text: string; fights: Array<{ id: number; name: string }> }
  | {
      kind: 'ask-player';
      text: string;
      players: Array<{ id: number; name: string; spec?: string }>;
    }
  | { kind: 'analysis' }
  | { kind: 'death-review' }
  | { kind: 'followup' }
  | { kind: 'error'; text: string };

/** Streamed events from `/api/chat` (content-type: text/event-stream). */
export type ChatEvent =
  | { type: 'start' }
  | { type: 'delta'; text: string }
  | { type: 'activity'; step: ActivityStep }
  | { type: 'artifact'; artifact: AnalysisArtifact }
  | { type: 'comparison'; comparison: ComparisonView }
  | { type: 'done' }
  | { type: 'reply'; kind: TurnReply['kind']; text?: string;
      fights?: Array<{ id: number; name: string }>;
      players?: Array<{ id: number; name: string; spec?: string }> }
  | { type: 'error'; text: string };

/** The conversation entry points surfaced to the user as "modules". */
export type ModuleId = 'combat' | 'wipe' | 'report' | 'chat';

export interface ModuleDef {
  id: ModuleId;
  label: string;
  description: string;
  guide: string;
  /** Prefilled composer placeholder scoped to this module. */
  placeholder: string;
  /** A sample message shown as a quick-start chip on the welcome screen. */
  sample: string;
  /** When true the module needs an LLM key to be useful. */
  needsLlm: boolean;
}
