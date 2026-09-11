/**
 * @deprecated
 *
 * Time-window primitives now live in `@wcl/combat-facts` (they operate on the
 * internal combat model and are shared with the fact computers). This module
 * re-exports them so existing imports keep working; new code should import
 * from `@wcl/combat-facts` directly.
 */
export * from '@wcl/combat-facts';
