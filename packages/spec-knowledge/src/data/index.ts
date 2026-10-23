import type { SpecKnowledge } from '../types.js';
import { BEAST_MASTERY_KNOWLEDGE } from './hunter-beast-mastery.js';
import { ARCANE_MAGE_KNOWLEDGE } from './mage-arcane.js';
import { ELEMENTAL_SHAMAN_KNOWLEDGE } from './shaman-elemental.js';
import { BLOOD_DEATH_KNIGHT_KNOWLEDGE } from './death-knight-blood.js';
import { RETRIBUTION_PALADIN_KNOWLEDGE } from './paladin-retribution.js';
import { ARMS_WARRIOR_KNOWLEDGE } from './warrior-arms.js';
import { VENGEANCE_DEMON_HUNTER_KNOWLEDGE } from './demon-hunter-vengeance.js';

/**
 * Knowledge shipped with the analyzer. Registered specs mirror the
 * `SpecRegistry` analyzers (Beast Mastery / Arcane / Elemental / Blood /
 * Retribution / Arms); the registry stays open so new specs load without
 * code changes.
 *
 * Vengeance DH is knowledge-only for now: it has no `SpecRegistry` analyzer,
 * but `evaluateRotation` still resolves the entry, and the MCP
 * `get_spec_knowledge` tool can surface its notes.
 */
export const DEFAULT_SPEC_KNOWLEDGE: readonly SpecKnowledge[] = [
  BEAST_MASTERY_KNOWLEDGE,
  ARCANE_MAGE_KNOWLEDGE,
  ELEMENTAL_SHAMAN_KNOWLEDGE,
  BLOOD_DEATH_KNIGHT_KNOWLEDGE,
  RETRIBUTION_PALADIN_KNOWLEDGE,
  ARMS_WARRIOR_KNOWLEDGE,
  VENGEANCE_DEMON_HUNTER_KNOWLEDGE,
];

export { BEAST_MASTERY_KNOWLEDGE } from './hunter-beast-mastery.js';
export { ARCANE_MAGE_KNOWLEDGE } from './mage-arcane.js';
export { ELEMENTAL_SHAMAN_KNOWLEDGE } from './shaman-elemental.js';
export { BLOOD_DEATH_KNIGHT_KNOWLEDGE } from './death-knight-blood.js';
export { RETRIBUTION_PALADIN_KNOWLEDGE } from './paladin-retribution.js';
export { ARMS_WARRIOR_KNOWLEDGE } from './warrior-arms.js';
export { VENGEANCE_DEMON_HUNTER_KNOWLEDGE } from './demon-hunter-vengeance.js';
