import { describe, it, expect } from 'vitest';
import { normalizeEvent } from '../src/normalize.js';

describe('normalizeEvent', () => {
  it('normalizes a cast event', () => {
    const event = normalizeEvent(
      {
        timestamp: 1000,
        type: 'cast',
        sourceID: 1,
        sourceName: 'Hero',
        abilityGameID: 217200,
        ability: { name: 'Barbed Shot', guid: 217200 },
      },
      8,
    );

    expect(event).toMatchObject({
      timestamp: 1000,
      type: 'cast',
      sourceId: 1,
      sourceName: 'Hero',
      abilityId: 217200,
      abilityName: 'Barbed Shot',
      fightId: 8,
    });
  });

  it('maps damage hitType numeric codes to labels', () => {
    const crit = normalizeEvent(
      { timestamp: 1, type: 'damage', hitType: 3 },
      1,
    );
    expect(crit.hitType).toBe('crit');

    const miss = normalizeEvent(
      { timestamp: 1, type: 'damage', hitType: 0 },
      1,
    );
    expect(miss.hitType).toBe('miss');
  });

  it('maps buff event types to domain types', () => {
    const apply = normalizeEvent(
      { timestamp: 1, type: 'applybuff', ability: { name: 'Bestial Wrath' } },
      1,
    );
    expect(apply.type).toBe('buff');

    const debuff = normalizeEvent(
      { timestamp: 1, type: 'applydebuff', ability: { name: 'Expose' } },
      1,
    );
    expect(debuff.type).toBe('debuff');
  });

  it('keeps unmitigatedAmount / overkill so dummy-log damage is not clamped to 1', () => {
    const nearDead = normalizeEvent(
      {
        timestamp: 1,
        type: 'damage',
        amount: 1,
        unmitigatedAmount: 5_905,
        overkill: 12_287,
        hitType: 2,
      },
      1,
    );
    expect(nearDead.type).toBe('damage');
    expect(nearDead.amount).toBe(1);
    expect(nearDead.unmitigatedAmount).toBe(5_905);
    expect(nearDead.overkill).toBe(12_287);

    const plain = normalizeEvent({ timestamp: 2, type: 'damage', amount: 900 }, 1);
    expect(plain.unmitigatedAmount).toBeUndefined();
    expect(plain.overkill).toBeUndefined();
  });

  it('keeps the buff stack count (applybuffstack → 2, plain applybuff → undefined)', () => {
    const toTwo = normalizeEvent(
      { timestamp: 1, type: 'applybuffstack', stack: 2, abilityGameID: 1256322 },
      1,
    );
    // 层数事件目前不进 TYPE_MAP（仍归一化为 'other'）：把它们并入 buff 会改变
    // 覆盖率类统计的口径，需要单独评估。消费方按 rawType 判断即可。
    expect(toTwo.rawType).toBe('applybuffstack');
    expect(toTwo.stack).toBe(2);

    const first = normalizeEvent({ timestamp: 2, type: 'applybuff', abilityGameID: 1256322 }, 1);
    expect(first.stack).toBeUndefined();
  });

  it('passes the heal overheal portion through (amount 0 + overheal > 0 = fully overhealed)', () => {
    const fully = normalizeEvent(
      {
        timestamp: 1,
        type: 'heal',
        amount: 0,
        overheal: 87_500,
        sourceID: 45,
        targetID: 42,
      },
      1,
    );
    expect(fully.type).toBe('heal');
    expect(fully.amount).toBe(0);
    expect(fully.overheal).toBe(87_500);

    const partial = normalizeEvent(
      { timestamp: 2, type: 'heal', amount: 40_000, overheal: 12_000 },
      1,
    );
    expect(partial.amount).toBe(40_000);
    expect(partial.overheal).toBe(12_000);

    const absent = normalizeEvent({ timestamp: 3, type: 'heal', amount: 5 }, 1);
    expect(absent.overheal).toBeUndefined();

    const cast = normalizeEvent(
      { timestamp: 4, type: 'cast', ability: { name: 'X' } },
      1,
    );
    expect(cast.overheal).toBeUndefined();
  });

  it('falls back to other for unknown types', () => {
    const event = normalizeEvent({ timestamp: 1, type: 'mystery' }, 1);
    expect(event.type).toBe('other');
  });
});
