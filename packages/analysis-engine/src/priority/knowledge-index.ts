import type { AbilityKnowledge, BuffKnowledge, SpecKnowledge } from '@wcl/spec-knowledge';

/**
 * Flat lookup tables over one `SpecKnowledge` entry.
 *
 * Built once per evaluation. The evaluator and the event replayer share it so
 * ability/buff/cooldown resolution is identical on both sides.
 */
export interface KnowledgeIndex {
  abilitiesByKey: Map<string, AbilityKnowledge>;
  abilitiesById: Map<number, AbilityKnowledge>;
  /** Self-applied auras only (`appliesTo: 'self'`). */
  buffsByKey: Map<string, BuffKnowledge>;
  buffsById: Map<number, BuffKnowledge>;
  /** Buff keys that are numeric stack counters. */
  stackBuffKeys: Set<string>;
  /**
   * Cooldown duration per ability key. Merged from `AbilityKnowledge.cooldownMs`
   * (primary) and `CooldownKnowledge` entries (override). A key missing here
   * has no known cooldown, so any `cooldownReady` on it is unobservable.
   */
  cooldownMsByKey: Map<string, number>;
}

/**
 * Normalize an ability/buff name to a comparable token:
 * - `"Arcane Blast"`            -> `"arcane blast"`
 * - `"奥冲 (Arcane Blast)"`     -> `"arcane blast"`  (English segment in parens)
 * - `"Arcane Charge, id 待核对"` -> `"arcane charge"`  (up to first comma)
 *
 * Used only as a *fallback* when an event lacks an abilityId and the knowledge
 * entry does not declare one either. Ids remain the primary matching key.
 */
export function normalizedNameToken(raw: string): string {
  const open = raw.indexOf('(');
  let segment = raw;
  if (open !== -1) {
    const close = raw.indexOf(')', open + 1);
    segment = raw.slice(open + 1, close === -1 ? undefined : close);
  }
  const comma = segment.indexOf(',');
  if (comma !== -1) {
    segment = segment.slice(0, comma);
  }
  return segment.trim().toLowerCase();
}

export function buildKnowledgeIndex(knowledge: SpecKnowledge): KnowledgeIndex {
  const abilitiesByKey = new Map<string, AbilityKnowledge>();
  const abilitiesById = new Map<number, AbilityKnowledge>();
  const buffsByKey = new Map<string, BuffKnowledge>();
  const buffsById = new Map<number, BuffKnowledge>();
  const stackBuffKeys = new Set<string>();
  const cooldownMsByKey = new Map<string, number>();

  for (const ability of knowledge.abilities) {
    abilitiesByKey.set(ability.key, ability);
    if (ability.abilityId !== undefined) {
      abilitiesById.set(ability.abilityId, ability);
    }
    if (ability.cooldownMs !== undefined) {
      cooldownMsByKey.set(ability.key, ability.cooldownMs);
    }
  }

  for (const buff of [...knowledge.buffs, ...knowledge.debuffs]) {
    if (buff.appliesTo !== 'self') continue;
    buffsByKey.set(buff.key, buff);
    if (buff.abilityId !== undefined) {
      buffsById.set(buff.abilityId, buff);
    }
    if (buff.stacks === true) {
      stackBuffKeys.add(buff.key);
    }
  }

  // CooldownKnowledge may declare durations the ability list omits (or
  // override the ability-level value). Explicit entries win.
  for (const cooldown of knowledge.cooldowns) {
    cooldownMsByKey.set(cooldown.key, cooldown.cooldownMs);
  }

  return {
    abilitiesByKey,
    abilitiesById,
    buffsByKey,
    buffsById,
    stackBuffKeys,
    cooldownMsByKey,
  };
}

/** Resolve a cast event's ability to a knowledge ability, id first then name. */
export function resolveAbility(
  index: KnowledgeIndex,
  event: { abilityId?: number | undefined; abilityName?: string | undefined },
): AbilityKnowledge | undefined {
  if (event.abilityId !== undefined) {
    const byId = index.abilitiesById.get(event.abilityId);
    if (byId) return byId;
  }
  if (event.abilityName !== undefined) {
    const token = normalizedNameToken(event.abilityName);
    for (const ability of index.abilitiesByKey.values()) {
      if (normalizedNameToken(ability.name) === token) return ability;
    }
  }
  return undefined;
}
