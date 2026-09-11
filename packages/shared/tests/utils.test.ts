import { describe, it, expect } from 'vitest';
import { stableHash, isNonEmptyString, isPlainObject } from '../src/utils.js';

describe('utils', () => {
  it('isNonEmptyString detects valid strings', () => {
    expect(isNonEmptyString('abc')).toBe(true);
    expect(isNonEmptyString('  ')).toBe(false);
    expect(isNonEmptyString(0)).toBe(false);
  });

  it('isPlainObject rejects arrays and null', () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });

  it('stableHash is deterministic', () => {
    const a = stableHash('analysis:v1:ABC:8:123');
    const b = stableHash('analysis:v1:ABC:8:123');
    const c = stableHash('analysis:v1:ABC:8:124');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
