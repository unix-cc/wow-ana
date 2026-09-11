#!/usr/bin/env node
/**
 * Regenerates the golden combat fixtures under tests/fixtures/combat.
 *
 * These JSON files are the single source of deterministic fight timelines for
 * integration / sanity tests (Phase J). They are *generated*, not hand-edited:
 * change a scenario here and re-run `node scripts/generate-combat-fixtures.mjs`,
 * then update the expectations in tests/integration if the intended findings
 * changed.
 *
 * Conventions:
 * - Events follow the internal CombatEvent shape (packages/domain/src/event.ts).
 * - Real WCL time frames: `report.startTime` is epoch ms, while `fight.startTime`
 *   and event timestamps are report-relative offsets. The fixture fight sits
 *   inside the knowledge effective window (>= 2026-01-01) so
 *   registry.resolve(report.startTime + fight.startTime) returns the expected
 *   knowledge version.
 * - meta.expectedFindingIds (BM) / meta.expectedRotationFinding (Arcane)
 *   document the author's intent and are asserted by the integration tests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tests',
  'fixtures',
  'combat',
);

/** Epoch when the mock report starts (inside every knowledge window). */
const REPORT_START = Date.parse('2026-06-01T00:00:00.000Z');
/** The fight begins 50s into the report (real logs have earlier fights). */
const FIGHT_OFFSET = 50_000;
const DURATION_MS = 60_000;
const FIGHT = { id: 8, startTime: FIGHT_OFFSET, endTime: FIGHT_OFFSET + DURATION_MS };
const REPORT = {
  code: 'FIXTURE',
  title: 'Fixture report',
  startTime: REPORT_START,
  endTime: REPORT_START + FIGHT_OFFSET + DURATION_MS,
  zone: { id: 1000, name: 'Nerub-ar Palace' },
};

/** BM spells (mirrors packages/analysis-engine specs constants). */
const BM = {
  killCommand: { abilityId: 34026, abilityName: 'Kill Command' },
  cobraShot: { abilityId: 193455, abilityName: 'Cobra Shot' },
};

/** Arcane spells used by the rotation fixture. */
const ARCANE_SALVO = { abilityId: 384452, abilityName: 'Arcane Salvo' };
const ARCANE_MISSILES = { abilityId: 5143, abilityName: 'Arcane Missiles' };
const ARCANE_BLAST = { abilityId: 30451, abilityName: 'Arcane Blast' };

function bmFixture() {
  // Teaching counter-example: casts every 1.5s for the first 30s (Kill Command
  // at its 0/6/12/18s cooldown slots), then the hunter stops casting entirely
  // for the remaining 30s. Intent:
  //   - Kill Command used 4/11 times  -> bm_hunter.kill_command_usage (high)
  //   - ~31.5s idle of 60s           -> bm_hunter.gcd_idle (high)
  //   - no Barbed Shot at all        -> bm_hunter.barbed_shot_uptime (high)
  // No Multi-Shot / Beast Cleave events -> beast-cleave rule does not apply.
  const events = [];
  for (let t = 0; t <= 28_500; t += 1_500) {
    const isKillCommand = t === 0 || t === 6_000 || t === 12_000 || t === 18_000;
    const ability = isKillCommand ? BM.killCommand : BM.cobraShot;
    events.push({
      timestamp: FIGHT_OFFSET + t,
      type: 'cast',
      sourceId: 1,
      abilityId: ability.abilityId,
      abilityName: ability.abilityName,
      fightId: FIGHT.id,
    });
  }

  return {
    meta: {
      id: 'hunter-bm-basic',
      specName: 'Beast Mastery',
      specId: 253,
      knowledgeVersion: '1.0.0',
      fightDateIso: new Date(REPORT_START + FIGHT_OFFSET).toISOString(),
      durationMs: DURATION_MS,
      description:
        '60s teaching counter-example: cobra spam first 30s, then AFK. Kill Command only 4x, no Barbed Shot.',
      expectedFindingIds: [
        'bm_hunter.kill_command_usage',
        'bm_hunter.gcd_idle',
        'bm_hunter.barbed_shot_uptime',
      ],
    },
    report: { ...REPORT, code: 'FIXTURE-HBM', title: 'Fixture: hunter-bm-basic' },
    fight: FIGHT,
    player: { id: 1, name: 'HunterFixture', type: 'Player', specName: 'Beast Mastery', specId: 253 },
    events,
  };
}

function arcaneFixture() {
  // Same golden scenario as the engine unit integration: Arcane Salvo stacks
  // up to 12, then the mage casts Arcane Missiles. At salvo 12 the missiles
  // rule is blocked, so the expected action is the Arcane Blast filler —
  // the orb rule needs Arcane Charges (buff id unverified → unobservable,
  // may only explain) — giving one rotation mistake
  // (expectedRuleId arcane.blast_builder, scenario st).
  const events = [
    {
      timestamp: FIGHT_OFFSET,
      type: 'buff',
      rawType: 'applybuff',
      sourceId: 1,
      targetId: 1,
      abilityId: ARCANE_SALVO.abilityId,
      abilityName: ARCANE_SALVO.abilityName,
      fightId: FIGHT.id,
    },
  ];
  for (let i = 1; i < 12; i += 1) {
    events.push({
      timestamp: FIGHT_OFFSET + i * 1_000,
      type: 'buff',
      rawType: 'applybuffstack',
      sourceId: 1,
      targetId: 1,
      abilityId: ARCANE_SALVO.abilityId,
      abilityName: ARCANE_SALVO.abilityName,
      fightId: FIGHT.id,
    });
  }
  // Blast at t+15s (salvo 12): the filler itself is the expected action
  // there — correct. It also marks arcane_blast as an OBSERVED ability,
  // which the never-observed filter in evaluateRotation requires before
  // blast can be the expected action for other casts.
  events.push({
    timestamp: FIGHT_OFFSET + 15_000,
    type: 'cast',
    sourceId: 1,
    abilityId: ARCANE_BLAST.abilityId,
    abilityName: ARCANE_BLAST.abilityName,
    fightId: FIGHT.id,
  });
  events.push({
    timestamp: FIGHT_OFFSET + 20_000,
    type: 'cast',
    sourceId: 1,
    abilityId: ARCANE_MISSILES.abilityId,
    abilityName: ARCANE_MISSILES.abilityName,
    fightId: FIGHT.id,
  });

  return {
    meta: {
      id: 'mage-arcane-basic',
      specName: 'Arcane',
      specId: 62,
      knowledgeVersion: '1.4.0',
      fightDateIso: new Date(REPORT_START + FIGHT_OFFSET).toISOString(),
      durationMs: DURATION_MS,
      description:
        '60s rotation scene: Arcane Salvo stacked to 12 by t+11s, Arcane Missiles at t+20s (blast filler is the expected action at salvo 12; orb rule is unobservable).',
      expectedRotationFinding: {
        scenario: 'st',
        verdict: 'mistake',
        expectedRuleId: 'arcane.blast_builder',
        actualAbilityKey: 'arcane_missiles',
      },
    },
    report: { ...REPORT, code: 'FIXTURE-ARCANE', title: 'Fixture: mage-arcane-basic' },
    fight: FIGHT,
    player: { id: 1, name: 'MageFixture', type: 'Player', specName: 'Arcane', specId: 62 },
    events,
  };
}

function write(name, fixture) {
  const file = join(OUT_DIR, name);
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`);
  const casts = fixture.events.filter((e) => e.type === 'cast').length;
  const buffs = fixture.events.length - casts;
  const span = fixture.events.length
    ? `${fixture.events[0].timestamp - fixture.fight.startTime}..${fixture.events[fixture.events.length - 1].timestamp - fixture.fight.startTime}`
    : 'empty';
  console.log(
    `wrote ${file}: ${fixture.events.length} events (${casts} cast, ${buffs} buff), offsets ${span}ms`,
  );
}

mkdirSync(OUT_DIR, { recursive: true });
write('hunter-bm-basic.json', bmFixture());
write('mage-arcane-basic.json', arcaneFixture());
console.log('done.');
