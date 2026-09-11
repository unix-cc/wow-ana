import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CombatEvent } from '@wcl/domain';

const FIXTURES = [
  {
    file: '../../fixtures/combat/hunter-bm-basic.json',
    id: 'hunter-bm-basic',
    specName: 'Beast Mastery',
  },
  {
    file: '../../fixtures/combat/mage-arcane-basic.json',
    id: 'mage-arcane-basic',
    specName: 'Arcane',
  },
] as const;

interface FixtureShape {
  meta: {
    id: string;
    specName: string;
    specId: number;
    knowledgeVersion: string;
    fightDateIso: string;
    durationMs: number;
  };
  report: {
    code: string;
    title: string;
    startTime: number;
    endTime: number;
  };
  fight: { id: number; startTime: number; endTime: number };
  player: { id: number; name: string; type: string; specName: string; specId?: number };
  events: CombatEvent[];
}

function loadFixture(entry: (typeof FIXTURES)[number]): FixtureShape {
  const raw = readFileSync(new URL(entry.file, import.meta.url), 'utf8');
  return JSON.parse(raw) as FixtureShape;
}

const VALID_TYPES = new Set([
  'cast',
  'damage',
  'heal',
  'buff',
  'debuff',
  'resource',
  'death',
  'interrupt',
  'dispel',
  'combatantinfo',
  'begincast',
  'other',
]);

describe('combat fixture sanity', () => {
  for (const entry of FIXTURES) {
    describe(entry.id, () => {
      const fixture = loadFixture(entry);

      it('has coherent meta and fight/player constants', () => {
        expect(fixture.meta.id).toBe(entry.id);
        expect(fixture.meta.specName).toBe(entry.specName);
        expect(fixture.meta.knowledgeVersion).toMatch(/^\d+\.\d+\.\d+$/);
        // Real WCL frames: report.startTime is epoch, fight.startTime is a
        // report-relative offset — the fight epoch is the sum.
        expect(fixture.meta.fightDateIso).toBe(
          new Date(fixture.report.startTime + fixture.fight.startTime).toISOString(),
        );
        expect(fixture.fight.endTime - fixture.fight.startTime).toBe(
          fixture.meta.durationMs,
        );
        expect(fixture.player.specName).toBe(entry.specName);
        expect(fixture.events.length).toBeGreaterThan(0);
      });

      it('models real WCL time frames (epoch report base + relative fight)', () => {
        // Regression guard for the Phase U fix: a fixture must never regress
        // to "fight.startTime is epoch" — that shape hides the report-base
        // addition and silently breaks knowledge resolution in production.
        expect(fixture.report.startTime).toBeGreaterThan(
          Date.parse('2020-01-01T00:00:00Z'),
        );
        expect(fixture.fight.startTime).toBeLessThan(
          fixture.report.endTime - fixture.report.startTime,
        );
      });

      it('has monotonic timestamps inside the fight window', () => {
        let previous = fixture.fight.startTime - 1;
        for (const event of fixture.events) {
          expect(event.timestamp).toBeGreaterThanOrEqual(fixture.fight.startTime);
          expect(event.timestamp).toBeLessThanOrEqual(fixture.fight.endTime);
          expect(event.timestamp).toBeGreaterThan(previous);
          previous = event.timestamp;
        }
      });

      it('uses only valid event types and consistent fight/source ids', () => {
        for (const event of fixture.events) {
          expect(VALID_TYPES.has(event.type)).toBe(true);
          expect(event.fightId).toBe(fixture.fight.id);
          expect(event.sourceId).toBe(fixture.player.id);
        }
      });

      it('carries the author-intended expectation markers', () => {
        if (fixture.meta.id.startsWith('hunter-bm')) {
          const meta = fixture.meta as typeof fixture.meta & {
            expectedFindingIds: string[];
          };
          expect(meta.expectedFindingIds.length).toBeGreaterThan(0);
        } else {
          const meta = fixture.meta as typeof fixture.meta & {
            expectedRotationFinding: {
              scenario: string;
              verdict: string;
              expectedRuleId: string;
            };
          };
          expect(meta.expectedRotationFinding.verdict).toBe('mistake');
          expect(meta.expectedRotationFinding.expectedRuleId).toMatch(
            /^arcane\./,
          );
        }
      });
    });
  }
});
