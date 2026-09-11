import type { KnowledgeSource } from '@wcl/domain';
import type {
  AbilityKnowledge,
  BuffKnowledge,
  PriorityRule,
  ResourceKnowledge,
  SpecKnowledge,
} from '@wcl/spec-knowledge';

/**
 * Synthetic knowledge + event builders for the priority evaluator / replayer
 * tests. Spell ids and rules are invented on purpose — tests never depend on
 * live WCL data or real spec mechanics.
 */

export const TEST_SOURCE: KnowledgeSource = {
  type: 'manual',
  reference: 'synthetic test knowledge (never shipped)',
};

export function ability(
  key: string,
  abilityId: number,
  name: string,
  overrides: Partial<AbilityKnowledge> = {},
): AbilityKnowledge {
  return {
    key,
    abilityId,
    name,
    kind: 'damage',
    source: TEST_SOURCE,
    confidence: 1,
    ...overrides,
  };
}

export function buff(
  key: string,
  abilityId: number,
  name: string,
  overrides: Partial<BuffKnowledge> = {},
): BuffKnowledge {
  return {
    key,
    abilityId,
    name,
    kind: 'buff',
    appliesTo: 'self',
    source: TEST_SOURCE,
    confidence: 1,
    ...overrides,
  };
}

export function resource(
  type: string,
  cap: number,
  overrides: Partial<ResourceKnowledge> = {},
): ResourceKnowledge {
  return {
    type,
    cap,
    source: TEST_SOURCE,
    confidence: 1,
    ...overrides,
  };
}

export interface PriorityKnowledgeOverrides {
  abilities?: AbilityKnowledge[];
  buffs?: BuffKnowledge[];
  resources?: ResourceKnowledge[];
  rules: PriorityRule[];
}

export function makePriorityKnowledge(overrides: PriorityKnowledgeOverrides): SpecKnowledge {
  const { abilities, buffs, resources, rules } = overrides;
  return {
    specId: 999,
    specName: 'TestSpec',
    className: 'Test',
    knowledgeVersion: '0.0.0-test',
    abilities,
    buffs: buffs ?? [],
    debuffs: [],
    resources: resources ?? [],
    cooldowns: [],
    priority: rules,
    sources: [TEST_SOURCE],
  };
}

/** Pre-built rule that fires unconditionally (default filler). */
export function fillerRule(
  action: string,
  id: string,
  confidence = 0.9,
): PriorityRule {
  return { id, action, when: {}, source: TEST_SOURCE, confidence };
}

export const TEST_ABILITIES = {
  blast: ability('blast', 101, 'Blast'),
  missiles: ability('missiles', 102, 'Missiles'),
  barrage: ability('barrage', 103, 'Barrage'),
  orb: ability('orb', 104, 'Orb', { kind: 'damage', cooldownMs: 20_000 }),
  surge: ability('surge', 105, 'Surge', { kind: 'cooldown', cooldownMs: 90_000 }),
} as const;

export const TEST_BUFFS = {
  proc: buff('proc', 201, 'Proc'),
  charges: buff('charges', 202, 'Charges', { stacks: true }),
  salvo: buff('salvo', 203, 'Salvo', { stacks: true }),
} as const;

export const TEST_RESOURCES = [resource('Focus', 100)];
