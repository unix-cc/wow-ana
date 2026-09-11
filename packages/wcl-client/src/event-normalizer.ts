/**
 * @deprecated
 *
 * Normalization now lives in `@wcl/combat-normalizer`, the single place that
 * knows about raw WCL field names. This module is kept as a re-export so
 * existing imports keep working; new code should import from
 * `@wcl/combat-normalizer` directly.
 */
export * from '@wcl/combat-normalizer';
