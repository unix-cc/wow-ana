/**
 * Spec Knowledge — "how the spec is supposed to be played", independent of
 * any single fight. Compare against Combat Facts (what actually happened)
 * inside the Analysis Engine.
 */
export * from './types.js';
export * from './registry.js';
export * from './data/index.js';

import { SpecKnowledgeRegistry } from './registry.js';
import { DEFAULT_SPEC_KNOWLEDGE } from './data/index.js';

/** Registry pre-loaded with the knowledge shipped in this package. */
export function createDefaultRegistry(): SpecKnowledgeRegistry {
  return new SpecKnowledgeRegistry([...DEFAULT_SPEC_KNOWLEDGE]);
}
