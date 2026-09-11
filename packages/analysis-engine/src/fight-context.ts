import type { Fight, Report } from '@wcl/domain';

/**
 * Mythic+ context detection. In a Mythic+ run the "fight" spans the whole
 * dungeon (every trash pack + boss), so time-based assumptions that hold for a
 * single boss pull break down:
 *
 * - movement between pulls / out-of-combat gaps look like GCD idle;
 * - single-target DoT/buff uptime rules do not apply to multi-target trash;
 * - a zero-cast "never used your big cooldown" signal is ambiguous (the spec
 *   build may simply not include the talent).
 *
 * WCL reports a Mythic+ dungeon under the zone named "Mythic+ …", so the zone
 * name is the stable detector (the fight's own `difficulty` holds the key
 * level, and `size` is 5).
 */
export function isMythicPlusRun(report: Report, _fight: Fight): boolean {
  return /mythic\s*\+/i.test(report.zone?.name ?? '');
}

/** Keystone level when the fight is a Mythic+ run, else undefined. */
export function mythicPlusKeyLevel(
  report: Report,
  fight: Fight,
): number | undefined {
  if (!isMythicPlusRun(report, fight)) return undefined;
  return typeof fight.difficulty === 'number' ? fight.difficulty : undefined;
}
