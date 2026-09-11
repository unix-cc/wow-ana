import { makeGcdIdleRule } from '../../../helpers.js';

/**
 * GCD idle rule. Significant idle time means lost casts; the rule reports the
 * largest idle windows as evidence. Factory-shared with every spec analyzer.
 */
export const gcdIdleRule = makeGcdIdleRule('bm_hunter.gcd_idle');
