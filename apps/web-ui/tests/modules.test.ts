import { describe, it, expect } from 'vitest';
import { MODULES, DEFAULT_MODULE, getModule } from '../src/modules';
import type { ModuleId } from '../src/types';

describe('MODULES', () => {
  it('ships the four entry modules with unique ids', () => {
    expect(MODULES.map((m) => m.id)).toEqual([
      'combat',
      'wipe',
      'report',
      'chat',
    ]);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
  });

  it('gives every module complete onboarding copy', () => {
    for (const m of MODULES) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.guide.length).toBeGreaterThan(0);
      expect(m.placeholder.length).toBeGreaterThan(0);
      expect(m.sample.length).toBeGreaterThan(0);
      expect(typeof m.needsLlm).toBe('boolean');
    }
  });

  it('marks the LLM-free report module', () => {
    const report = MODULES.find((m) => m.id === 'report');
    expect(report?.needsLlm).toBe(false);
    // The other three need a configured LLM to be useful.
    for (const m of MODULES.filter((x) => x.id !== 'report')) {
      expect(m.needsLlm).toBe(true);
    }
  });
});

describe('getModule', () => {
  it('returns the module for a known id', () => {
    expect(getModule('wipe').label).toBe('团灭复盘');
  });

  it('falls back to the default module for unknown ids', () => {
    expect(getModule('nope' as ModuleId).id).toBe(DEFAULT_MODULE);
    expect(DEFAULT_MODULE).toBe('combat');
  });
});
