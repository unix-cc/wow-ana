/**
 * Small display-only formatters. The UI never recomputes analysis numbers —
 * it only formats values the engine already produced (timestamps → mm:ss.s,
 * ratios → percentages, DPS → 万/亿 as Chinese players read them).
 */

/** Fight-relative milliseconds → `mm:ss.s` (e.g. 92_300 → `01:32.3`). */
export function formatClock(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  // Integer millisecond math: `92.3 - 60` is 32.299999999999997 in binary
  // floating point, which would render the tenths digit as 2.
  const totalMs = Math.round(ms);
  const seconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = seconds % 60;
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
}

/** Compact duration for headers: `3:12` / `1:02:30`. */
export function formatDuration(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Large numbers the way Chinese players say them: 125400 → `12.5 万`. */
export function formatAmount(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${(value / 10_000).toFixed(1)} 万`;
  }
  return Math.round(value).toLocaleString('zh-CN');
}

/** Severity → display label + css modifier. */
export function severityMeta(severity: string): {
  label: string;
  modifier: string;
} {
  switch (severity) {
    case 'critical':
      return { label: '严重', modifier: 'critical' };
    case 'high':
      return { label: '高', modifier: 'high' };
    case 'medium':
      return { label: '中', modifier: 'medium' };
    case 'low':
      return { label: '低', modifier: 'low' };
    default:
      return { label: '提示', modifier: 'info' };
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  rotation: '技能循环',
  cooldown: '爆发 / CD',
  buff: 'Buff',
  resource: '资源',
  target: '目标',
  damage: '伤害',
  mechanic: '机制',
  death: '死亡',
  uptime: '覆盖率',
  movement: '移动',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

const VERDICT_LABELS: Record<string, string> = {
  correct: '正确',
  acceptable: '可接受',
  suboptimal: '次优',
  mistake: '失误',
  unknown: '待定',
};

export function verdictLabel(verdict: string): string {
  return VERDICT_LABELS[verdict] ?? verdict;
}

/** Evidence value + unit, e.g. `4200 ms` → `4.2s`. */
export function formatEvidenceValue(
  value: number | undefined,
  unit: string | undefined,
): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (unit === 'ms') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }
  if (unit === 'ratio') return `${(value * 100).toFixed(1)}%`;
  return unit !== undefined ? `${value} ${unit}` : String(value);
}

/** Render an `expected`/`actual` record as short `key value` pairs. */
export function formatRecord(
  record: Record<string, unknown> | undefined,
): Array<{ key: string; value: string }> {
  if (record === undefined) return [];
  const out: Array<{ key: string; value: string }> = [];
  for (const [key, raw] of Object.entries(record)) {
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'number') {
      out.push({ key, value: formatEvidenceValue(raw, undefined) ?? String(raw) });
    } else if (typeof raw === 'boolean') {
      out.push({ key, value: raw ? '是' : '否' });
    } else {
      out.push({ key, value: String(raw) });
    }
  }
  return out;
}
