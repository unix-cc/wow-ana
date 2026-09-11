import type { Player } from '@wcl/domain';
import type { SpecKnowledge } from './types.js';

/**
 * Resolve the Spec Knowledge that applies to a fight.
 *
 * Two dimensions matter:
 *
 * 1. **Who** — resolved from the player's specId, falling back to spec name.
 * 2. **When** — resolved from the fight date, so a historical log is judged
 *    by the rules that were live at the time (never by current mechanics).
 */
export class SpecKnowledgeRegistry {
  private readonly bySpecId = new Map<number, SpecKnowledge[]>();
  private readonly bySpecName = new Map<string, SpecKnowledge[]>();

  constructor(entries: SpecKnowledge[] = []) {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(entry: SpecKnowledge): void {
    if (entry.specId !== undefined) {
      const list = this.bySpecId.get(entry.specId) ?? [];
      list.push(entry);
      this.bySpecId.set(entry.specId, list);
    }
    const named = this.bySpecName.get(entry.specName) ?? [];
    named.push(entry);
    this.bySpecName.set(entry.specName, named);
  }

  /** All known versions of a spec, newest `effectiveFrom` first. */
  versionsFor(player: Player): SpecKnowledge[] {
    const candidates =
      (player.specId !== undefined ? this.bySpecId.get(player.specId) : undefined) ??
      (player.specName !== undefined
        ? this.bySpecName.get(player.specName)
        : undefined) ??
      [];

    return [...candidates].sort(compareKnowledge);
  }

  /**
   * Resolve knowledge for a player at a given fight time (epoch ms).
   * Returns undefined when the spec is unknown or no version was live then.
   */
  resolve(player: Player, fightTime?: number): SpecKnowledge | undefined {
    const versions = this.versionsFor(player);
    if (versions.length === 0) return undefined;
    if (fightTime === undefined) return versions[0];

    const iso = new Date(fightTime).toISOString();
    return versions.find((entry) => isLiveAt(entry, iso)) ?? undefined;
  }

  /**
   * Convenience lookup used by tests and tooling. Returns the *newest*
   * entry (same ordering as {@link versionsFor}), not registration order.
   */
  getBySpecName(specName: string): SpecKnowledge | undefined {
    const list = this.bySpecName.get(specName);
    return list === undefined ? undefined : [...list].sort(compareKnowledge)[0];
  }

  getBySpecId(specId: number): SpecKnowledge | undefined {
    const list = this.bySpecId.get(specId);
    return list === undefined ? undefined : [...list].sort(compareKnowledge)[0];
  }
}

/**
 * Newest first: later `effectiveFrom` wins; when two entries share a date
 * (or both omit it) the higher `knowledgeVersion` breaks the tie so lookups
 * never depend on registration order.
 */
function compareKnowledge(a: SpecKnowledge, b: SpecKnowledge): number {
  const byDate = (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? '');
  if (byDate !== 0) return byDate;
  return compareVersionsDesc(a.knowledgeVersion, b.knowledgeVersion);
}

/** Semver-ish descending compare ("2.0.0" before "1.9.9"; tolerates short forms). */
function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isLiveAt(entry: SpecKnowledge, isoDate: string): boolean {
  if (entry.effectiveFrom !== undefined && isoDate < entry.effectiveFrom) {
    return false;
  }
  if (entry.effectiveTo !== undefined && isoDate >= entry.effectiveTo) {
    return false;
  }
  return true;
}
