import type { CombatEvent } from '@wcl/domain';

/**
 * 虚落流星的「串」模型。
 *
 * 关键事实（5 份单目标日志实测，2026-10-23）：**一串流星的颗数 == 本次消耗的虚落层数**。
 * 3 颗的串是「2 颗普通 + 第 3 颗升级为灭世灾星」，4 颗的串是「3 普通 + 1 灾星」。
 *
 * ⚠ 颗数 **不是** 伤害事件数，原因有两个（都是实战日志验证的）：
 *   1. AoE 时一颗流星命中 N 个目标 → N 条事件；
 *   2. 有减伤的目标会把一次命中拆成多条（block / absorb 分开记）→ 同一目标同一毫秒 2–4 条。
 * 所以唯一可靠的单位是**撞击时刻**：同一毫秒内的所有命中算一次撞击。
 *
 * 代价：两次撞击恰好落在同一毫秒时会被合并（B 组就是这种情况），此时颗数被低估 1，
 * 所以「消耗层数」只在**单目标**串上统计（单目标时一次撞击就是一颗流星）。
 *
 * 串的切分：相邻两颗间隔 ≤700ms 视为同一串（实测串内 311–459ms，串间 >1 GCD）。
 */

export interface MeteorVolley {
  /** 第一颗的落地时间（epoch ms）。 */
  startTime: number;
  /** 最后一颗的落地时间。 */
  endTime: number;
  /** 撞击次数（按毫秒去重）。 */
  impacts: number;
  /** 其中灭世灾星的撞击次数（每串最多 1）。 */
  worldKillerHits: number;
  /** 伤害事件条数（AoE 时远大于颗数）。 */
  damageEvents: number;
  /** 命中的不同目标数。 */
  targets: number;
  /** 未减免伤害合计。 */
  damage: number;
}

export interface MeteorIds {
  meteor: number;
  worldKiller: number;
}

/** 串内最大间隔；超过即视为新的一串。 */
export const VOLLEY_MERGE_GAP_MS = 700;

/**
 * 一次命中记多少伤害：**一律用 `amount`**（WCL 统计页的口径）。
 *
 * 不去替换成 `unmitigatedAmount`：实测两边的相对大小并不稳定
 * （有减伤的目标上 block 行的 amount 反而更大，假人濒死行则是 amount 被钳成 1），
 * 混用会让同一场里的伤害合计既不是"实际伤害"也不是"理论伤害"。
 * 假人这类被 overkill 钳制的日志由 analyzer 打 `dataQuality` 标记，
 * 调用方看到标记就不该用这里的伤害做跨场比较。
 */
function damageOf(event: CombatEvent): number {
  return event.amount ?? 0;
}

/** 该行是否被"目标濒死"钳制（overkill 有值且 amount 被压到 0/1）。 */
export function isOverkillClamped(event: CombatEvent): boolean {
  return event.overkill !== undefined && (event.amount ?? 0) < 2;
}

export function collectMeteorVolleys(
  events: readonly CombatEvent[],
  sourceId: number,
  ids: MeteorIds,
  mergeGapMs: number = VOLLEY_MERGE_GAP_MS,
): MeteorVolley[] {
  const hits = events
    .filter(
      (event) =>
        event.type === 'damage' &&
        event.sourceId === sourceId &&
        (event.abilityId === ids.meteor || event.abilityId === ids.worldKiller),
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  // 先按时间聚成「时刻组」，再按间隔切串
  const moments: Array<{ timestamp: number; events: CombatEvent[] }> = [];
  for (const hit of hits) {
    const last = moments[moments.length - 1];
    if (last !== undefined && hit.timestamp === last.timestamp) last.events.push(hit);
    else moments.push({ timestamp: hit.timestamp, events: [hit] });
  }

  const volleys: MeteorVolley[] = [];
  let current: MeteorVolley | undefined;
  const seenTargets = new Set<number>();

  for (const moment of moments) {
    if (current === undefined || moment.timestamp - current.endTime > mergeGapMs) {
      current = {
        startTime: moment.timestamp,
        endTime: moment.timestamp,
        impacts: 0,
        worldKillerHits: 0,
        damageEvents: 0,
        targets: 0,
        damage: 0,
      };
      volleys.push(current);
      seenTargets.clear();
    }

    current.endTime = moment.timestamp;
    current.impacts += 1;
    current.damageEvents += moment.events.length;
    current.damage += moment.events.reduce((sum, event) => sum + damageOf(event), 0);
    if (moment.events.some((event) => event.abilityId === ids.worldKiller)) {
      current.worldKillerHits += 1;
    }
    for (const event of moment.events) {
      const target = event.targetId ?? -1;
      if (!seenTargets.has(target)) {
        seenTargets.add(target);
        current.targets += 1;
      }
    }
  }

  return volleys;
}

export interface MeteorSummary {
  volleys: number;
  /** 撞击次数合计（AoE 与减伤拆分都已去重）。 */
  impacts: number;
  /** 只在单目标串上统计的「消耗层数」；多目标时该值不可用。 */
  singleTargetStacks: number;
  /** 伤害事件条数合计（AoE 参考量，不是层数）。 */
  damageEvents: number;
  damage: number;
  /**
   * 4 颗的串的数量。这是「炸弹 → 爆炸瞬间裂劈」合并结算多算一颗的结果
   * （见 docs/vdh-meteor-12.1.5.md §6），不是玩家失误。
   */
  fourHitVolleys: number;
  /** 每串颗数分布，便于快速看资源利用（例：{ '3': 2, '4': 1 }）。 */
  sizeHistogram: Record<string, number>;
}

export function summarizeVolleys(volleys: readonly MeteorVolley[]): MeteorSummary {
  const sizeHistogram: Record<string, number> = {};
  let impacts = 0;
  let singleTargetStacks = 0;
  let damageEvents = 0;
  let damage = 0;
  let fourHitVolleys = 0;
  for (const volley of volleys) {
    impacts += volley.impacts;
    if (volley.targets === 1) singleTargetStacks += volley.impacts;
    damageEvents += volley.damageEvents;
    damage += volley.damage;
    const size = String(volley.impacts);
    sizeHistogram[size] = (sizeHistogram[size] ?? 0) + 1;
    if (volley.impacts === 4 && volley.targets === 1) fourHitVolleys += 1;
  }
  return {
    volleys: volleys.length,
    impacts,
    singleTargetStacks,
    damageEvents,
    damage,
    fourHitVolleys,
    sizeHistogram,
  };
}
