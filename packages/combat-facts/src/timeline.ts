import type { CombatEvent } from '@wcl/domain';

/**
 * Time-window primitives shared by every fact computer.
 *
 * These operate on the **internal combat model**, so they stay valid even if
 * the upstream WCL schema changes.
 */

/** Filter combat events by their normalized type. */
export function eventsOfType(
  events: CombatEvent[],
  type: CombatEvent['type'],
): CombatEvent[] {
  return events.filter((event) => event.type === type);
}

/** Filter events to those with a specific ability (by id or name). */
export function eventsOfAbility(
  events: CombatEvent[],
  abilityId?: number,
  abilityName?: string,
): CombatEvent[] {
  return events.filter((event) => {
    if (abilityId !== undefined && event.abilityId === abilityId) return true;
    if (abilityName !== undefined && event.abilityName === abilityName) {
      return true;
    }
    return false;
  });
}

/** Cast events from a specific source (sourceId), ordered by timestamp. */
export function castsBySource(
  events: CombatEvent[],
  sourceId: number,
): CombatEvent[] {
  return eventsOfType(events, 'cast')
    .filter((event) => event.sourceId === sourceId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** Compute the difference between consecutive timestamps. */
export function intervalsBetween(events: CombatEvent[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1];
    const curr = events[i];
    if (prev && curr) {
      intervals.push(curr.timestamp - prev.timestamp);
    }
  }
  return intervals;
}

/**
 * Find contiguous idle windows where no event occurs for at least
 * `thresholdMs`, within [startTime, endTime].
 */
export function findIdleWindows(
  events: CombatEvent[],
  startTime: number,
  endTime: number,
  thresholdMs: number,
): Array<{ start: number; end: number; durationMs: number }> {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const windows: Array<{ start: number; end: number; durationMs: number }> = [];

  let prevTimestamp = startTime;
  for (const event of sorted) {
    const gap = event.timestamp - prevTimestamp;
    if (gap > thresholdMs) {
      windows.push({
        start: prevTimestamp,
        end: event.timestamp,
        durationMs: gap,
      });
    }
    prevTimestamp = event.timestamp;
  }

  const tailGap = endTime - prevTimestamp;
  if (tailGap > thresholdMs) {
    windows.push({ start: prevTimestamp, end: endTime, durationMs: tailGap });
  }

  return windows;
}

/** Sum the total idle time across idle windows. */
export function totalIdleMs(
  windows: Array<{ start: number; end: number; durationMs: number }>,
): number {
  return windows.reduce((sum, window) => sum + window.durationMs, 0);
}
