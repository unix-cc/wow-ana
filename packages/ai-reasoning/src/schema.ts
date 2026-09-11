import { z } from 'zod';
import type { FindingCategory } from '@wcl/domain';

/**
 * Structured AI output (ARCHITECTURE §23).
 *
 * Every AI claim must stay traceable to a deterministic finding, so each AI
 * finding carries a `sourceId` drawn from the brief's `sources` set. Severity
 * and verdict are *not* free-form here: they are re-derived from the source
 * finding by the renderer, which stops the model from escalating or
 * downplaying a problem on its own.
 */

// Compile-time sync with the domain category union: adding a category in
// @wcl/domain fails the build here until the literal list is updated.
export const CATEGORY_VALUES = [
  'rotation',
  'cooldown',
  'buff',
  'resource',
  'target',
  'damage',
  'mechanic',
  'death',
  'uptime',
  'movement',
] as const satisfies readonly FindingCategory[];

export const MAX_AI_FINDINGS = 6;
export const MAX_RECOMMENDATIONS = 5;

export const AiReportSchema = z.object({
  /** One-paragraph plain-language summary of the fight. */
  summary: z.string().min(1).max(4000),
  performance: z
    .object({
      /** Restating the engine score is optional; never invent one. */
      score: z.number().min(0).max(100).optional(),
    })
    .optional(),
  findings: z
    .array(
      z.object({
        /** 1 = most important; must be unique across the report. */
        priority: z.number().int().min(1),
        category: z.enum(CATEGORY_VALUES),
        title: z.string().min(1).max(160),
        reason: z.string().min(1).max(2000),
        impact: z.string().max(1000).optional(),
        solution: z.string().max(1000).optional(),
        /** Must reference an id present in the brief `sources`. */
        sourceId: z.string().min(1).max(200),
      }),
    )
    .max(MAX_AI_FINDINGS)
    .default([]),
  recommendations: z.array(z.string().min(1).max(500)).max(MAX_RECOMMENDATIONS).optional(),
});

export type AiReport = z.infer<typeof AiReportSchema>;

/** Marker a compliant model prefixes when it cannot produce valid JSON. */
export const AI_JSON_ERROR_PREFIX = 'JSON_ERROR:';

export type AiReportParseResult =
  | { ok: true; report: AiReport }
  | { ok: false; error: string };

/** A one-line human-readable description of a zod issue path. */
function describeIssue(issue: z.ZodIssue): string {
  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
  return `${path}${issue.message}`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1] !== undefined) return fenced[1];
  // Models sometimes wrap the JSON in prose; fall back to the outermost pair
  // of braces when they are present.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

/**
 * Parse a model reply as an AiReport. A reply that starts with the degraded
 * marker, is not valid JSON, or violates the schema returns `{ ok: false }`
 * with a human-readable reason so callers can fall back to Markdown and show
 * an explicit error (never a silently empty report).
 */
export function parseAiReport(text: string): AiReportParseResult {
  if (text.trimStart().startsWith(AI_JSON_ERROR_PREFIX)) {
    return { ok: false, error: '模型声明无法生成结构化 JSON（降级标记）' };
  }
  let json: unknown;
  try {
    json = JSON.parse(extractJson(text)) as unknown;
  } catch (error) {
    return {
      ok: false,
      error: `输出不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const parsed = AiReportSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 5).map(describeIssue).join('；');
    return { ok: false, error: `结构化字段校验失败：${details}` };
  }
  return { ok: true, report: parsed.data };
}

/**
 * Verify report provenance: every AI finding must cite a source that actually
 * exists in the brief, and priorities must be unique 1..n. Returns a list of
 * problems (empty when the report is safe to render).
 */
export function checkProvenance(
  report: AiReport,
  allowedSourceIds: readonly string[],
): string[] {
  const problems: string[] = [];
  const allowed = new Set(allowedSourceIds);
  const seenPriorities = new Set<number>();
  const seenSourceIds = new Set<string>();
  for (const finding of report.findings) {
    if (seenPriorities.has(finding.priority)) {
      problems.push(`priority ${finding.priority} 重复`);
    }
    seenPriorities.add(finding.priority);
    if (!allowed.has(finding.sourceId)) {
      problems.push(`sourceId "${finding.sourceId}" 不在 brief.sources 中`);
    }
    if (seenSourceIds.has(finding.sourceId)) {
      problems.push(`sourceId "${finding.sourceId}" 被多个 finding 重复引用`);
    }
    seenSourceIds.add(finding.sourceId);
  }
  return problems;
}
