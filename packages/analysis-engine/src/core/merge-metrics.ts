/**
 * Deterministic merge guard for analyzer metrics.
 *
 * Analyzers each contribute their own metrics namespace; when two analyzers
 * write the same key with different values that is a programming error and
 * must fail loudly at development time instead of silently overwriting.
 */
export function mergeMetrics(
  target: Record<string, unknown>,
  incoming: Record<string, unknown>,
  source: string,
): void {
  for (const [key, value] of Object.entries(incoming)) {
    const existing = target[key];
    if (existing === undefined) {
      if (value !== undefined) {
        target[key] = value;
      }
      continue;
    }
    if (value === undefined) continue;
    if (JSON.stringify(existing) === JSON.stringify(value)) continue;
    throw new Error(
      `metrics key collision: "${key}" is produced by an earlier analyzer ` +
        `and by ${source} with different values. Give each analyzer its own ` +
        'metrics namespace.',
    );
  }
}
