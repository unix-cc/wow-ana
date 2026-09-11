import { describe, it, expect } from 'vitest';
import { ArcaneMageAnalyzer } from '../src/specs/mage/arcane/analyzer.js';
import { SpecRegistry } from '../src/specs/registry.js';
import { clearcastingWasteRule } from '../src/specs/mage/arcane/rules/clearcasting-waste.js';
import { arcaneChargesOverflowRule } from '../src/specs/mage/arcane/rules/arcane-charges-overflow.js';
import { arcaneSurgeDelayRule } from '../src/specs/mage/arcane/rules/arcane-surge-delay.js';
import { makeContext, cast, buff } from './helpers.js';
import { ARCANE_ABILITIES } from '../src/specs/mage/arcane/constants.js';

const BL = ARCANE_ABILITIES.arcaneBlast.abilityId;
const MS = ARCANE_ABILITIES.arcaneMissiles.abilityId;
const BR = ARCANE_ABILITIES.arcaneBarrage.abilityId;
const AS = ARCANE_ABILITIES.arcaneSurge.abilityId;
const CC = ARCANE_ABILITIES.clearcasting.abilityId;

function procs(n: number, start = 0, step = 10_000) {
  return Array.from({ length: n }, (_, i) =>
    buff(start + i * step, 'applybuff', CC, 'Clearcasting'),
  );
}

describe('clearcastingWasteRule', () => {
  it('flags wasted Clearcasting procs', () => {
    const events = [
      ...procs(20),
      ...Array.from({ length: 5 }, (_, i) =>
        cast(i * 1000, MS, 'Arcane Missiles'),
      ),
    ];
    const findings = clearcastingWasteRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('arcane_mage.clearcasting_waste');
  });

  it('stays silent when procs are consumed', () => {
    const events = [
      ...procs(20),
      ...Array.from({ length: 15 }, (_, i) =>
        cast(i * 1000, MS, 'Arcane Missiles'),
      ),
    ];
    const findings = clearcastingWasteRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('arcaneChargesOverflowRule', () => {
  it('flags over-built charges with too few Barrages', () => {
    const events = [
      ...Array.from({ length: 40 }, (_, i) =>
        cast(i * 1500, BL, 'Arcane Blast'),
      ),
      cast(0, BR, 'Arcane Barrage'),
    ];
    const findings = arcaneChargesOverflowRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('arcane_mage.arcane_charges_overflow');
  });

  it('stays silent with a balanced blast/barrage cadence', () => {
    const events = [
      ...Array.from({ length: 40 }, (_, i) =>
        cast(i * 1500, BL, 'Arcane Blast'),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        cast(i * 6000, BR, 'Arcane Barrage'),
      ),
    ];
    const findings = arcaneChargesOverflowRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 100_000 }),
    );
    expect(findings).toHaveLength(0);
  });
});

describe('arcaneSurgeDelayRule', () => {
  it('flags delayed Arcane Surge casts', () => {
    const events = [
      cast(0, AS, 'Arcane Surge'),
      cast(100_000, AS, 'Arcane Surge'),
      cast(190_000, AS, 'Arcane Surge'),
    ];
    const findings = arcaneSurgeDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('arcane_mage.arcane_surge_delay');
  });

  it('stays silent for on-cooldown casts', () => {
    const events = [
      cast(0, AS, 'Arcane Surge'),
      cast(90_000, AS, 'Arcane Surge'),
      cast(180_000, AS, 'Arcane Surge'),
    ];
    const findings = arcaneSurgeDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 300_000 }),
    );
    expect(findings).toHaveLength(0);
  });
  it('flags a big cooldown that is barely used', () => {
    const events = [cast(0, AS, 'Arcane Surge')];
    const findings = arcaneSurgeDelayRule.evaluate(
      makeContext({ events, fightStart: 0, fightEnd: 500_000 }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.title).toContain('基本未使用');
  });
});

describe('ArcaneMageAnalyzer', () => {
  it('reports spec metadata and runs all rules', () => {
    const analyzer = new ArcaneMageAnalyzer();
    const result = analyzer.analyze(
      makeContext({ fightStart: 0, fightEnd: 100_000 }),
    );
    expect(result.spec).toBe('Arcane Mage');
    const metrics = result.metrics as { ruleIds: string[] };
    expect(metrics.ruleIds).toHaveLength(4);
  });
});

describe('SpecRegistry (new specs)', () => {
  it('matches Arcane / Elemental / Blood by spec name', () => {
    const registry = new SpecRegistry();
    expect(
      registry
        .findForPlayer({
          id: 1,
          name: 'A',
          type: 'Player',
          specName: 'Arcane',
        })
        ?.getSpec(),
    ).toBe('Arcane Mage');
    expect(
      registry
        .findForPlayer({
          id: 1,
          name: 'E',
          type: 'Player',
          specName: 'Elemental',
        })
        ?.getSpec(),
    ).toBe('Elemental Shaman');
    expect(
      registry
        .findForPlayer({
          id: 1,
          name: 'B',
          type: 'Player',
          specName: 'Blood',
        })
        ?.getSpec(),
    ).toBe('Blood Death Knight');
  });

  it('matches Arcane / Elemental / Blood by spec id', () => {
    const registry = new SpecRegistry();
    expect(
      registry
        .findForPlayer({
          id: 1,
          name: 'A',
          type: 'Player',
          specId: 62,
        })
        ?.getSpec(),
    ).toBe('Arcane Mage');
    expect(
      registry
        .findForPlayer({
          id: 1,
          name: 'E',
          type: 'Player',
          specId: 262,
        })
        ?.getSpec(),
    ).toBe('Elemental Shaman');
    expect(
      registry
        .findForPlayer({
          id: 1,
          name: 'B',
          type: 'Player',
          specId: 250,
        })
        ?.getSpec(),
    ).toBe('Blood Death Knight');
  });
});
