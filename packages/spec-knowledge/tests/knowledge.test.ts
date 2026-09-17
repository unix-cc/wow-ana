import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SPEC_KNOWLEDGE,
  BEAST_MASTERY_KNOWLEDGE,
  ARCANE_MAGE_KNOWLEDGE,
  BLOOD_DEATH_KNIGHT_KNOWLEDGE,
  RETRIBUTION_PALADIN_KNOWLEDGE,
  ARMS_WARRIOR_KNOWLEDGE,
} from '../src/index.js';
import { canEscalateToMistake } from '@wcl/domain';

const ALL = [...DEFAULT_SPEC_KNOWLEDGE];

describe('knowledge structure', () => {
  it('ships at least the two registered specs with unique identity', () => {
    const names = ALL.map((entry) => entry.specName);
    expect(names).toContain('Beast Mastery');
    expect(names).toContain('Arcane');
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every entry within the confidence scale', () => {
    for (const entry of ALL) {
      const values = [
        ...entry.abilities.map((a) => a.confidence),
        ...entry.buffs.map((b) => b.confidence),
        ...entry.cooldowns.map((c) => c.confidence),
        ...entry.priority.map((p) => p.confidence),
      ];
      for (const value of values) {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('ships the Retribution and Arms entries with verified cooldown ids', () => {
    expect(RETRIBUTION_PALADIN_KNOWLEDGE.specId).toBe(70);
    expect(ARMS_WARRIOR_KNOWLEDGE.specId).toBe(71);

    // The three Ret cooldowns that back cooldownReady conditions must all
    // carry both an id and a duration.
    for (const key of [
      'avenging_wrath',
      'execution_sentence',
      'wake_of_ashes',
    ]) {
      const cd = RETRIBUTION_PALADIN_KNOWLEDGE.cooldowns.find(
        (c) => c.key === key,
      );
      expect(cd?.abilityId, `retribution ${key} id`).toBeDefined();
      expect(cd?.cooldownMs, `retribution ${key} cooldownMs`).toBeGreaterThan(
        0,
      );
    }

    // Arms: Colossus Smash verified (167105 / 45s); Demolish ships without
    // an id on purpose (unverified) — it must never be referenced by a
    // cooldownReady condition.
    const cs = ARMS_WARRIOR_KNOWLEDGE.cooldowns.find(
      (c) => c.key === 'colossus_smash',
    );
    expect(cs?.abilityId).toBe(167105);
    expect(cs?.cooldownMs).toBe(45_000);
    const demolish = ARMS_WARRIOR_KNOWLEDGE.cooldowns.find(
      (c) => c.key === 'demolish',
    );
    expect(demolish?.abilityId).toBeUndefined();
    expect(demolish?.cooldownMs).toBe(30_000);
    for (const rule of ARMS_WARRIOR_KNOWLEDGE.priority) {
      expect(rule.when.cooldownReady ?? []).not.toContain('demolish');
    }
  });

  it('keeps unverified Ret/Arms abilities dormant (no abilityId)', () => {
    // Art of War buff and Divine Toll ability must stay id-less until a
    // real log verifies them — dormant, never guessed.
    const artOfWar = RETRIBUTION_PALADIN_KNOWLEDGE.buffs.find(
      (b) => b.key === 'art_of_war',
    );
    expect(artOfWar?.abilityId).toBeUndefined();
    const divineToll = RETRIBUTION_PALADIN_KNOWLEDGE.abilities.find(
      (a) => a.key === 'divine_toll',
    );
    expect(divineToll?.abilityId).toBeUndefined();
    // And no Ret priority rule may depend on the unidentifiable buff.
    for (const rule of RETRIBUTION_PALADIN_KNOWLEDGE.priority) {
      expect(rule.when.buffActive ?? []).not.toContain('art_of_war');
      expect(rule.when.buffStacks ?? []).not.toContainEqual(
        expect.objectContaining({ key: 'art_of_war' }),
      );
    }
  });

  it('anchors the Blood DK Bone Shield maintenance priority (v1.2.0)', () => {
    expect(BLOOD_DEATH_KNIGHT_KNOWLEDGE.knowledgeVersion).toBe('1.2.0');
    const boneShield = BLOOD_DEATH_KNIGHT_KNOWLEDGE.buffs.find(
      (b) => b.key === 'bone_shield',
    );
    expect(boneShield?.stacks).toBe(true);
    const rule = BLOOD_DEATH_KNIGHT_KNOWLEDGE.priority.find(
      (r) => r.id === 'blood.marrowrend_low_bone_shield',
    );
    expect(rule?.action).toBe('marrowrend');
    expect(rule?.when.buffStacks).toEqual([{ key: 'bone_shield', max: 3 }]);
    // Tank defensives stay out of the priority list on purpose.
    expect(
      BLOOD_DEATH_KNIGHT_KNOWLEDGE.priority.some((r) =>
        ['vampiric_blood', 'dancing_rune_weapon'].includes(r.action),
      ),
    ).toBe(false);
  });

  it('resolves every priority action to a known ability', () => {
    for (const entry of ALL) {
      const keys = new Set(entry.abilities.map((a) => a.key));
      for (const rule of entry.priority) {
        expect(
          keys.has(rule.action),
          `${entry.specName}: priority ${rule.id} targets unknown ability '${rule.action}'`,
        ).toBe(true);
      }
    }
  });

  it('sources every entry in the sources ledger', () => {
    for (const entry of ALL) {
      const every = (list: Array<{ source: { reference: string } }>): void => {
        for (const item of list) {
          expect(item.source.reference.length).toBeGreaterThan(0);
        }
      };
      every(entry.abilities);
      every(entry.buffs);
      every(entry.cooldowns);
      every(entry.priority);
    }
  });

  it('only strong knowledge may escalate to a mistake', () => {
    // Boundary: the guard is inclusive at MIN_MISTAKE_CONFIDENCE (0.6).
    const beastCleave = BEAST_MASTERY_KNOWLEDGE.priority.find(
      (rule) => rule.id === 'bm.beast_cleave_aoe',
    );
    expect(beastCleave?.confidence).toBe(0.6);
    expect(canEscalateToMistake(beastCleave?.confidence ?? 0)).toBe(true);
    // Anything below the floor must not escalate.
    expect(canEscalateToMistake(0.59)).toBe(false);

    // Kill Command on cooldown (0.8) is strong enough to flag.
    const killCommand = BEAST_MASTERY_KNOWLEDGE.priority.find(
      (rule) => rule.id === 'bm.kill_command',
    );
    expect(canEscalateToMistake(killCommand?.confidence ?? 0)).toBe(true);
  });

  it('keeps cooldown knowledge consistent with ability knowledge', () => {
    const arcane = ARCANE_MAGE_KNOWLEDGE;
    const cd = arcane.cooldowns.find((c) => c.key === 'arcane_surge');
    const ability = arcane.abilities.find((a) => a.key === 'arcane_surge');
    expect(cd).toBeDefined();
    expect(ability).toBeDefined();
    expect(cd?.cooldownMs).toBe(ability?.cooldownMs);
  });

  it('keeps burst anchors castable: burstDurationMs implies a verified abilityId', () => {
    // Burst windows are cast-anchored (WCL Buffs does not return burst-aura
    // events — probe-verified 2026-09), so an anchor without a spell id can
    // never be matched to a cast and must not be declared.
    for (const entry of ALL) {
      for (const cd of entry.cooldowns) {
        if (cd.burstDurationMs === undefined) continue;
        expect(
          cd.abilityId,
          `${entry.specName} ${cd.key}: burstDurationMs needs a verified abilityId`,
        ).toBeDefined();
        expect(
          cd.burstDurationMs,
          `${entry.specName} ${cd.key}: burstDurationMs must be positive`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('resolves every condition reference to a known key', () => {
    for (const entry of ALL) {
      const known = new Set([
        ...entry.abilities.map((a) => a.key),
        ...entry.buffs.map((b) => b.key),
        ...entry.debuffs.map((d) => d.key),
        ...entry.cooldowns.map((c) => c.key),
      ]);
      const stackable = new Set(
        entry.buffs.filter((b) => b.stacks).map((b) => b.key),
      );

      for (const rule of entry.priority) {
        for (const key of rule.when.buffActive ?? []) {
          expect(known.has(key), `${rule.id}: unknown buffActive '${key}'`).toBe(
            true,
          );
        }
        for (const key of rule.when.buffMissing ?? []) {
          expect(
            known.has(key),
            `${rule.id}: unknown buffMissing '${key}'`,
          ).toBe(true);
        }
        for (const key of rule.when.cooldownReady ?? []) {
          expect(
            known.has(key),
            `${rule.id}: unknown cooldownReady '${key}'`,
          ).toBe(true);
        }
        for (const predicate of rule.when.buffStacks ?? []) {
          expect(
            stackable.has(predicate.key),
            `${rule.id}: '${predicate.key}' is not a stackable buff`,
          ).toBe(true);
        }
      }
    }
  });

  it('backs every cooldownReady reference with an actual cooldown duration', () => {
    // Regression: arcane.barrage_orb_aoe referenced cooldownReady:'arcane_orb'
    // while no ability/cooldown entry declared a cooldownMs for it — the rule
    // could never fire (evaluator degrades unknown cooldowns to 'unknown').
    for (const entry of ALL) {
      const cdMs = new Map<string, number>();
      for (const ability of entry.abilities) {
        if (ability.cooldownMs !== undefined) {
          cdMs.set(ability.key, ability.cooldownMs);
        }
      }
      for (const cooldown of entry.cooldowns) {
        cdMs.set(cooldown.key, cooldown.cooldownMs);
      }
      for (const rule of entry.priority) {
        for (const key of rule.when.cooldownReady ?? []) {
          expect(
            cdMs.has(key),
            `${entry.specName}:${rule.id} cooldownReady '${key}' has no known cooldownMs — the rule can never fire`,
          ).toBe(true);
        }
      }
    }
  });

  it('encodes the arcane salvo/charges bounds faithfully', () => {
    const salvo = (ruleId: string) =>
      ARCANE_MAGE_KNOWLEDGE.priority.find((r) => r.id === ruleId)?.when
        .buffStacks;

    // 齐射=25
    expect(salvo('arcane.barrage_salvo25')).toEqual([
      { key: 'arcane_salvo', min: 25, max: 25 },
    ]);
    // 齐射≥12
    expect(salvo('arcane.barrage_clearcast')).toEqual([
      { key: 'arcane_salvo', min: 12 },
    ]);
    // AOE: 齐射≥12 + 宝珠可用 + 目标≥3
    const aoe = ARCANE_MAGE_KNOWLEDGE.priority.find(
      (r) => r.id === 'arcane.barrage_orb_aoe',
    );
    expect(aoe?.when.cooldownReady).toEqual(['arcane_orb']);
    expect(aoe?.when.targetCountMin).toBe(3);
    // AOE 专属：单/双目标场景整条删除（scenario 标记而非仅条件不满足）
    expect(aoe?.scenario).toBe('aoe');
    // 充能<3
    expect(salvo('arcane.orb_low_charges')).toEqual([
      { key: 'arcane_charge', max: 2 },
    ]);
    // 齐射<12 → max 11
    expect(salvo('arcane.missiles_salvo_low')).toEqual([
      { key: 'arcane_salvo', max: 11 },
    ]);
  });

  it('keeps the two same-name "奥术齐射" objects distinct', () => {
    // Both 384452 and 1242974 are called 奥术齐射 (Arcane Salvo) in game, so the
    // spell id is the only discriminator — this test exists to keep it that way.
    const byId = new Map(
      ARCANE_MAGE_KNOWLEDGE.buffs
        .filter((b) => b.name.includes('奥术齐射'))
        .map((b) => [b.abilityId, b]),
    );
    expect(byId.size).toBe(2);

    // 384452 — 齐射核心资源/天赋机制，必须是叠层计数器。
    const resource = byId.get(384452);
    expect(resource?.key).toBe('arcane_salvo');
    expect(resource?.stacks).toBe(true);
    expect(resource?.name).toContain('核心资源');

    // 1242974 — 12.1 四件套“下一次技能增伤”buff，独立对象，非叠层计数。
    const tierBuff = byId.get(1242974);
    expect(tierBuff?.key).toBe('tier_4pc_damage_buff');
    expect(tierBuff?.stacks).toBeFalsy();
    expect(tierBuff?.name).toContain('四件套');

    // id 是唯一判别键：两个对象绝不能混淆。
    expect(resource).not.toBe(tierBuff);
    expect(resource?.key).not.toBe(tierBuff?.key);
  });

  it('keeps aoe-scenario rules out of single/dual-target evaluation', () => {
    // 单/双目标视图：scenario==='aoe' 的规则必须整条不存在。
    const singleTargetRules = ARCANE_MAGE_KNOWLEDGE.priority.filter(
      (rule) => rule.scenario !== 'aoe',
    );
    expect(
      singleTargetRules.map((rule) => rule.id),
    ).not.toContain('arcane.barrage_orb_aoe');

    // 不变量：凡标记 aoe 的规则都必须声明目标数下限，防止误伤单体。
    for (const entry of ALL) {
      for (const rule of entry.priority) {
        if (rule.scenario === 'aoe') {
          expect(
            rule.when.targetCountMin !== undefined &&
              rule.when.targetCountMin >= 3,
            `${entry.specName}:${rule.id} marks aoe but lacks targetCountMin >= 3`,
          ).toBe(true);
        }
      }
    }
  });

  it('resolves every arcane priority action to a spell id', () => {
    // After the player supplied the missing ids, no arcane rule may stay
    // dormant. Only buffs that still miss an id (e.g. arcane_charge) remain.
    const actions = ARCANE_MAGE_KNOWLEDGE.priority.map((rule) => {
      const ability = ARCANE_MAGE_KNOWLEDGE.abilities.find(
        (a) => a.key === rule.action,
      );
      return { ruleId: rule.id, abilityId: ability?.abilityId };
    });
    for (const entry of actions) {
      expect(
        entry.abilityId,
        `${entry.ruleId} still targets an unresolved ability`,
      ).toBeDefined();
    }

    const pendingBuffs = ARCANE_MAGE_KNOWLEDGE.buffs.filter(
      (buff) => buff.abilityId === undefined,
    );
    expect(pendingBuffs.map((b) => b.key)).toEqual(['arcane_charge']);
  });
});
