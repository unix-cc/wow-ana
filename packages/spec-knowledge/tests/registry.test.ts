import { describe, it, expect } from 'vitest';
import { SpecKnowledgeRegistry, createDefaultRegistry } from '../src/index.js';
import type { Player } from '@wcl/domain';

function bmPlayer(overrides?: Partial<Player>): Player {
  return {
    id: 1,
    name: 'Hero',
    type: 'Player',
    specId: 253,
    specName: 'Beast Mastery',
    className: 'Hunter',
    ...overrides,
  };
}

describe('SpecKnowledgeRegistry', () => {
  it('resolves a player by specId', () => {
    const registry = createDefaultRegistry();
    const knowledge = registry.resolve(bmPlayer());
    expect(knowledge?.specName).toBe('Beast Mastery');
    expect(knowledge?.knowledgeVersion).toBe('1.1.0');
  });

  it('falls back to the spec name when specId is absent', () => {
    const registry = createDefaultRegistry();
    const knowledge = registry.resolve(
      bmPlayer({ specId: undefined, specName: 'Beast Mastery' }),
    );
    expect(knowledge?.className).toBe('Hunter');
  });

  it('returns undefined for unknown specs', () => {
    const registry = createDefaultRegistry();
    expect(
      registry.resolve(bmPlayer({ specId: undefined, specName: 'Feral' })),
    ).toBeUndefined();
  });

  it('selects the version that was live at the fight date', () => {
    const current = createDefaultRegistry().getBySpecId(253) as NonNullable<
      ReturnType<SpecKnowledgeRegistry['getBySpecId']>
    >;
    const legacy: typeof current = {
      ...current,
      effectiveFrom: '2020-01-01',
      effectiveTo: '2026-01-01',
      knowledgeVersion: '0.9.0',
    };
    const registry = new SpecKnowledgeRegistry([legacy, current]);

    // Default entry lives from 2026-01-01: a 2025 fight gets the legacy one.
    const inLegacyWindow = registry.resolve(
      bmPlayer(),
      Date.parse('2025-06-01T00:00:00Z'),
    );
    expect(inLegacyWindow?.knowledgeVersion).toBe('0.9.0');

    // A 2026 fight (after effectiveFrom) gets the current entry.
    const live = registry.resolve(bmPlayer(), Date.parse('2026-06-01T00:00:00Z'));
    expect(live?.knowledgeVersion).toBe('1.1.0');
  });

  it('without a fight time prefers the newest version', () => {
    const registry = new SpecKnowledgeRegistry();
    const current = createDefaultRegistry().getBySpecId(253) as NonNullable<
      ReturnType<SpecKnowledgeRegistry['getBySpecId']>
    >;
    registry.register(current);
    registry.register({
      ...current,
      effectiveFrom: '2027-01-01',
      knowledgeVersion: '2.0.0',
    });

    expect(registry.resolve(bmPlayer())?.knowledgeVersion).toBe('2.0.0');
  });

  it('breaks effectiveFrom ties by knowledgeVersion, not registration order', () => {
    const registry = new SpecKnowledgeRegistry();
    const current = createDefaultRegistry().getBySpecId(253) as NonNullable<
      ReturnType<SpecKnowledgeRegistry['getBySpecId']>
    >;
    // Register the NEWER version first: the tiebreaker must still pick it.
    registry.register({ ...current, knowledgeVersion: '1.4.0' });
    registry.register({ ...current, knowledgeVersion: '1.3.0' });

    expect(registry.resolve(bmPlayer())?.knowledgeVersion).toBe('1.4.0');
    expect(registry.getBySpecId(253)?.knowledgeVersion).toBe('1.4.0');
    expect(registry.getBySpecName('Beast Mastery')?.knowledgeVersion).toBe(
      '1.4.0',
    );
  });

  it('getBySpec* return the newest entry regardless of registration order', () => {
    const registry = new SpecKnowledgeRegistry();
    const current = createDefaultRegistry().getBySpecId(253) as NonNullable<
      ReturnType<SpecKnowledgeRegistry['getBySpecId']>
    >;
    registry.register({ ...current, knowledgeVersion: '0.9.0' });
    registry.register(current);

    expect(registry.getBySpecId(253)?.knowledgeVersion).toBe(
      current.knowledgeVersion,
    );
    expect(registry.getBySpecName('Beast Mastery')?.knowledgeVersion).toBe(
      current.knowledgeVersion,
    );
  });
});
