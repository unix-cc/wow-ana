import type { CombatEvent } from '@wcl/domain';
import { roleOfSpec } from './roles.js';

/**
 * Deterministic death / wipe / add review helpers (whole-fight perspective).
 *
 * These are pure functions: the caller (application layer) is responsible for
 * fetching the full-roster death events and the per-dead-player damage-taken
 * streams and passing them in. No WCL-fetching, no LLM — every output field is
 * backed by concrete events so a host model can explain without inventing.
 */

/** A single death of one friendly player. */
export interface ReviewDeathPoint {
  /** Report-absolute timestamp (ms). */
  timestamp: number;
  playerId: number;
  playerName: string;
  specName?: string | undefined;
}

export interface ReviewPlayer {
  id: number;
  name: string;
  specName?: string | undefined;
}

export interface DeathIncident {
  deathAt: number;
  /** Milliseconds after fight start. */
  relativeMs: number;
  playerId: number;
  playerName: string;
  specName?: string | undefined;
  role: 'tank' | 'healer' | 'dps' | 'unknown';
  /** Damage window analysed before the death (ms). */
  windowMs: number;
  hits: number;
  takenTotal: number;
  /** How long between the first hit in the window and the death (ms). */
  burstMs: number;
  /** The last non-zero damaging hit before death. */
  killer:
    | {
        sourceId?: number | undefined;
        sourceName?: string | undefined;
        abilityId?: number | undefined;
        abilityName?: string | undefined;
        amount: number;
        at: number;
      }
    | undefined;
  /** Damage aggregated by attacker (NPC / environment / player). */
  topSources: Array<{
    sourceId?: number | undefined;
    sourceName?: string | undefined;
    hits: number;
    total: number;
  }>;
  /** First time each attacker hit the dead player inside the window. */
  mobFirstAttacks: Array<{ sourceId: number; at: number }>;
  /** Effective healing received inside the pre-death window (amount>0 rows). */
  healingReceived: number;
  /** Number of effective heal events in the window. */
  healCount: number;
  /**
   * Heal attempts in the window including fully-overhealed rows (amount 0 +
   * overheal > 0): when this exceeds healCount the healer WAS casting but the
   * target was at full health when the burst landed.
   */
  healAttempts: number;
  /** Overhealed portion summed over the window's heal attempts. */
  overhealInWindow: number;
  /** Effective healing inside the window, attributed per healer. */
  healers: Array<{
    playerId: number;
    playerName?: string | undefined;
    count: number;
    total: number;
  }>;
  /**
   * When the victim has a healing gap and a healer died shortly before them:
   * the evidence-backed reason for the gap. `hadHealedVictim` marks healers
   * who had healed this player earlier in the fight (stronger attribution).
   */
  healerDiedBefore?: {
    playerId: number;
    playerName: string;
    /** How long before the victim's death the healer died (ms). */
    diedMsBefore: number;
    hadHealedVictim: boolean;
  } | undefined;
  /** Heuristic cause classification. */
  cause: 'burst-kill' | 'sustained' | 'environment' | 'no-data' | 'unknown';
  /** Human-readable factual summary for the host model to quote. */
  summary: string;
}

export interface WipeEvent {
  deaths: Array<{
    playerId: number;
    playerName: string;
    role: 'tank' | 'healer' | 'dps' | 'unknown';
    relativeMs: number;
  }>;
  /** Fight-relative window of the wipe. */
  startAtMs: number;
  endAtMs: number;
  firstDeathPlayerName: string;
  triggerDeathIndex: number;
}

export interface AddSuspicion {
  mobId: number;
  mobName?: string | undefined;
  /** Fight-relative ms when the mob was first touched by any friendly. */
  firstTouchedAtMs?: number | undefined;
  touchedBy?: {
    playerId: number;
    playerName: string;
    role: 'tank' | 'healer' | 'dps' | 'unknown';
  } | undefined;
  /** Fight-relative ms when the mob first damaged the dead player. */
  firstHitPlayerAtMs: number;
  relatedDeathPlayerName: string;
  /** True when the mob entered combat shortly before the death. */
  recentAdd: boolean;
  confidence: 'high' | 'medium' | 'low';
  note: string;
}

export interface MobTouchInfo {
  mobId: number;
  mobName?: string | undefined;
  /** Report-absolute ms of the first friendly hit on the mob. */
  firstTouchedAt?: number | undefined;
  touchedBy?: {
    playerId: number;
    playerName: string;
    role: 'tank' | 'healer' | 'dps' | 'unknown';
  } | undefined;
}

export interface DeathReviewOptions {
  /** Pre-death damage window (ms). */
  windowMs?: number | undefined;
  /** Max gap between deaths that still counts as one wipe (ms). */
  wipeGapMs?: number | undefined;
  /** Min distinct dead players to call it a wipe. */
  wipeMinPlayers?: number | undefined;
  /** A mob first touched within this window before a death is an "add" candidate. */
  addWindowMs?: number | undefined;
}

export const DEFAULT_DEATH_WINDOW_MS = 8000;
export const DEFAULT_WIPE_GAP_MS = 15_000;
export const DEFAULT_WIPE_MIN_PLAYERS = 3;
export const DEFAULT_ADD_WINDOW_MS = 15_000;
/**
 * How long before a victim's death a healer may have died and still explain
 * the healing gap (M+ wipe cascades trail 30-60s behind the first casualty,
 * verified on real logs).
 */
export const DEFAULT_HEALER_DEATH_WINDOW_MS = 90_000;

const ENVIRONMENT_SOURCE_ID = -1;

/**
 * Cluster sorted death points into wipe groups: deaths separated by more than
 * `wipeGapMs` start a new group; a group with at least `wipeMinPlayers`
 * distinct players is reported as a wipe.
 */
export function clusterWipes(
  deaths: ReviewDeathPoint[],
  options?: DeathReviewOptions,
): ReviewDeathPoint[][] {
  const gapMs = options?.wipeGapMs ?? DEFAULT_WIPE_GAP_MS;
  const minPlayers = options?.wipeMinPlayers ?? DEFAULT_WIPE_MIN_PLAYERS;

  const sorted = [...deaths].sort((a, b) => a.timestamp - b.timestamp);
  const groups: ReviewDeathPoint[][] = [];
  for (const death of sorted) {
    const last = groups.at(-1);
    const lastDeath = last?.at(-1);
    if (last && lastDeath && death.timestamp - lastDeath.timestamp <= gapMs) {
      last.push(death);
    } else {
      groups.push([death]);
    }
  }
  return groups.filter((group) => new Set(group.map((d) => d.playerId)).size >= minPlayers);
}

/**
 * Build one {@link DeathIncident} from the death point and its pre-death
 * damage-taken events (already fetched for this player, windowed by caller or
 * windowed here).
 *
 * `healingEvents` are the heals the player *received* (WCL `Healing` dataType
 * + targetID=player; verified live: amount>0 rows are effective healing,
 * fully-overhealed rows carry amount 0 and are ignored).
 */
export function buildDeathIncident(
  death: ReviewDeathPoint,
  takenEvents: CombatEvent[],
  options?: {
    windowMs?: number | undefined;
    fightStart?: number | undefined;
    mobNameById?: ReadonlyMap<number, string> | undefined;
    /**
     * Actor ids of the friendly roster. Damage events whose source is a
     * friendly actor (absorb ticks, self-inflicted damage) are not hostile
     * attacks; excluding them keeps topSources / killer / add-detection
     * grounded in mobs and the environment only.
     */
    friendlySourceIds?: ReadonlySet<number> | undefined;
    /** All death points of the fight (the healer-death attribution scans them). */
    priorDeaths?: ReadonlyArray<ReviewDeathPoint> | undefined;
    /** Role lookup for the attribution (healer detection). */
    roleById?: ReadonlyMap<number, 'tank' | 'healer' | 'dps' | 'unknown'> | undefined;
    /** Friendly names for healer attribution. */
    playerNameById?: ReadonlyMap<number, string> | undefined;
    /** Max distance between a healer's death and the victim's (ms). */
    healerDeathWindowMs?: number | undefined;
  },
  healingEvents: CombatEvent[] = [],
): DeathIncident {
  const windowMs = options?.windowMs ?? DEFAULT_DEATH_WINDOW_MS;
  const fightStart = options?.fightStart ?? 0;
  const mobNameById = options?.mobNameById;
  const friendlySourceIds = options?.friendlySourceIds;
  const roleById = options?.roleById;
  const playerNameById = options?.playerNameById;
  const healerDeathWindowMs =
    options?.healerDeathWindowMs ?? DEFAULT_HEALER_DEATH_WINDOW_MS;

  const windowStart = death.timestamp - windowMs;
  const inWindow = takenEvents.filter(
    (e) =>
      e.type === 'damage' &&
      e.targetId === death.playerId &&
      e.timestamp >= windowStart &&
      e.timestamp <= death.timestamp,
  );

  const damaging = inWindow.filter((e) => {
    if ((e.amount ?? 0) <= 0) return false;
    // Self-source entries (sourceId===targetId) are shield absorb ticks and
    // self-inflicted damage — WCL records them as ordinary damage events but
    // they are not hostile attacks on the player.
    if (e.sourceId !== undefined && e.sourceId === e.targetId) return false;
    if (
      friendlySourceIds &&
      e.sourceId !== undefined &&
      friendlySourceIds.has(e.sourceId)
    ) {
      return false;
    }
    return true;
  });
  const hits = damaging.length;
  const takenTotal = damaging.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  // Time between the first damaging hit and the death.
  const firstHitTs = damaging[0]?.timestamp;
  const lastHit = damaging.at(-1);
  const burstMs =
    firstHitTs !== undefined ? death.timestamp - firstHitTs : 0;

  const bySource = new Map<
    number,
    {
      hits: number;
      total: number;
      sourceId?: number | undefined;
      sourceName?: string | undefined;
    }
  >();
  const mobFirstAttacks: Array<{ sourceId: number; at: number }> = [];
  for (const e of damaging) {
    const sid = e.sourceId;
    const key = sid ?? ENVIRONMENT_SOURCE_ID;
    const bucket = bySource.get(key) ?? {
      hits: 0,
      total: 0,
      sourceId: sid,
      sourceName: e.sourceName,
    };
    bucket.hits += 1;
    bucket.total += e.amount ?? 0;
    if (sid !== undefined && sid > 0) {
      const known = mobFirstAttacks.find((m) => m.sourceId === sid);
      if (!known) mobFirstAttacks.push({ sourceId: sid, at: e.timestamp });
    }
    bySource.set(key, bucket);
  }
  mobFirstAttacks.sort((a, b) => a.at - b.at);

  const nameOf = (id?: number, fallback?: string): string | undefined => {
    if (fallback) return fallback;
    if (id === undefined) return undefined;
    return mobNameById?.get(id) ?? (id === ENVIRONMENT_SOURCE_ID ? 'Environment' : undefined);
  };

  const topSources = [...bySource.values()]
    .sort((a, b) => b.total - a.total)
    .map((s) => ({
      sourceId: s.sourceId,
      sourceName: nameOf(s.sourceId, s.sourceName),
      hits: s.hits,
      total: s.total,
    }));

  const envTotal =
    bySource.get(ENVIRONMENT_SOURCE_ID)?.total ?? 0;
  const specName = death.specName;
  const role = roleOfSpec(specName);

  // Effective healing received in the window: type-heal rows on this player
  // with a positive amount (WCL records fully-overhealed rows as amount 0).
  const healsInWindow = healingEvents.filter(
    (e) =>
      e.type === 'heal' &&
      e.targetId === death.playerId &&
      (e.amount ?? 0) > 0 &&
      e.timestamp >= windowStart &&
      e.timestamp <= death.timestamp,
  );
  const healingReceived = healsInWindow.reduce(
    (sum, e) => sum + (e.amount ?? 0),
    0,
  );
  const healCount = healsInWindow.length;

  // Heal attempts include fully-overhealed rows (amount 0, overheal > 0 —
  // verified live): they prove the healer was casting into a full-health
  // target when the burst landed, which is a different story from "no
  // healing happened at all".
  const healAttemptRows = healingEvents.filter(
    (e) =>
      e.type === 'heal' &&
      e.targetId === death.playerId &&
      ((e.amount ?? 0) > 0 || (e.overheal ?? 0) > 0) &&
      e.timestamp >= windowStart &&
      e.timestamp <= death.timestamp,
  );
  const healAttempts = healAttemptRows.length;
  const overhealInWindow = healAttemptRows.reduce(
    (sum, e) => sum + (e.overheal ?? 0),
    0,
  );

  // Attribute the window healing per healer (source of the heal rows).
  const healerById = new Map<number, { count: number; total: number }>();
  for (const heal of healsInWindow) {
    if (heal.sourceId === undefined) continue;
    const bucket = healerById.get(heal.sourceId) ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += heal.amount ?? 0;
    healerById.set(heal.sourceId, bucket);
  }
  const healers = [...healerById.entries()]
    .map(([playerId, bucket]) => ({
      playerId,
      playerName: playerNameById?.get(playerId),
      count: bucket.count,
      total: bucket.total,
    }))
    .sort((a, b) => b.total - a.total);

  // Healer-death attribution: only meaningful when there is damage to heal
  // and the healing could not keep up. A healer who died shortly before the
  // victim is the evidence-backed explanation for the gap — never a verdict
  // on the healer (they may have died to the same mechanic).
  let healerDiedBefore: DeathIncident['healerDiedBefore'];
  if (
    takenTotal > 0 &&
    healingReceived < takenTotal &&
    options?.priorDeaths !== undefined &&
    roleById !== undefined
  ) {
    const deadHealers = options.priorDeaths
      .filter(
        (d) =>
          d.playerId !== death.playerId &&
          d.timestamp < death.timestamp &&
          roleById.get(d.playerId) === 'healer' &&
          death.timestamp - d.timestamp <= healerDeathWindowMs,
      )
      .sort((a, b) => b.timestamp - a.timestamp); // nearest first
    const nearest = deadHealers[0];
    if (nearest !== undefined) {
      const hadHealedVictim = healingEvents.some(
        (e) =>
          e.type === 'heal' &&
          e.sourceId === nearest.playerId &&
          e.targetId === death.playerId &&
          (e.amount ?? 0) > 0 &&
          e.timestamp <= death.timestamp,
      );
      healerDiedBefore = {
        playerId: nearest.playerId,
        playerName:
          nearest.playerName || playerNameById?.get(nearest.playerId) ||
          `#${nearest.playerId}`,
        diedMsBefore: death.timestamp - nearest.timestamp,
        hadHealedVictim,
      };
    }
  }

  let cause: DeathIncident['cause'];
  if (hits === 0) {
    cause = 'no-data';
  } else if (envTotal > 0 && envTotal >= takenTotal * 0.8) {
    cause = 'environment';
  } else if (burstMs <= 1500 && hits <= 3) {
    cause = 'burst-kill';
  } else if (burstMs >= 5000) {
    cause = 'sustained';
  } else {
    cause = 'unknown';
  }

  const killer =
    lastHit && (lastHit.amount ?? 0) > 0
      ? {
          sourceId: lastHit.sourceId,
          sourceName: nameOf(lastHit.sourceId, lastHit.sourceName),
          abilityId: lastHit.abilityId,
          abilityName: lastHit.abilityName,
          amount: lastHit.amount ?? 0,
          at: lastHit.timestamp,
        }
      : undefined;

  const killerDesc = killer
    ? `${killer.sourceName ?? `source#${killer.sourceId ?? '?'}`}${
        killer.abilityName
          ? ` 的 ${killer.abilityName}`
          : killer.abilityId
            ? ` #${killer.abilityId}`
            : ''
      } ${killer.amount}`
    : '无受击数据';
  const firstDesc =
    firstHitTs !== undefined
      ? `死亡前 ${(burstMs / 1000).toFixed(1)}s 开始受击`
      : '';

  // Healing-gap phrasing: only meaningful when there was damage to heal.
  const healerNamesDesc =
    healers.length > 0
      ? `，来源 ${healers
          .slice(0, 2)
          .map((h) => `${h.playerName ?? `#${h.playerId}`}`)
          .join('、')}`
      : '';
  const healerDeathDesc = healerDiedBefore
    ? `（治疗者 ${healerDiedBefore.playerName} 于 ${(
        healerDiedBefore.diedMsBefore / 1000
      ).toFixed(1)}s 前阵亡${healerDiedBefore.hadHealedVictim ? '，此前曾治疗该玩家' : ''}）`
    : '';
  const healingDesc =
    takenTotal > 0
      ? healingReceived === 0
        ? healAttempts > 0
          ? `窗口内无有效治疗（${healAttempts} 次治疗尝试全部过量 ${overhealInWindow.toLocaleString()}——目标满血后被打爆）${healerDeathDesc}`
          : `窗口内无有效治疗${healerDeathDesc || healerNamesDesc}`
        : healingReceived < takenTotal
          ? `有效治疗 ${healingReceived.toLocaleString()}（缺口 ${(
              takenTotal - healingReceived
            ).toLocaleString()}${healerNamesDesc}${
              overhealInWindow > 0
                ? `，另有 ${overhealInWindow.toLocaleString()} 过量`
                : ''
            }）${healerDeathDesc}`
          : `有效治疗 ${healingReceived.toLocaleString()}（已覆盖受击${healerNamesDesc}）`
      : '';

  const summary =
    `${death.playerName}@${((death.timestamp - fightStart) / 1000).toFixed(0)}s ` +
    `${role === 'unknown' ? '' : `${role} `}` +
    `死亡；死亡前 ${(windowMs / 1000).toFixed(0)}s 内 ${hits} 次受击共 ${takenTotal.toLocaleString()}，` +
    `最后一击：${killerDesc}；${firstDesc}${healingDesc ? `；${healingDesc}` : ''}；主伤害来源：${
      topSources
        .slice(0, 3)
        .map((s) => `${s.sourceName ?? `#${s.sourceId ?? '?'}`} ${s.total.toLocaleString()}`)
        .join('、') || '无'
    }。`;

  return {
    deathAt: death.timestamp,
    relativeMs: death.timestamp - fightStart,
    playerId: death.playerId,
    playerName: death.playerName,
    specName,
    role,
    windowMs,
    hits,
    takenTotal,
    burstMs,
    killer,
    topSources,
    mobFirstAttacks,
    healingReceived,
    healCount,
    healAttempts,
    overhealInWindow,
    healers,
    ...(healerDiedBefore !== undefined ? { healerDiedBefore } : {}),
    cause,
    summary,
  };
}

/**
 * Suggest add candidates from incidents whose window contains mobs that were
 * first touched by a non-tank shortly before the death, or that attacked the
 * player before any tank contact.
 *
 * Honest by design: without threat tables this is a *candidate* with evidence,
 * never a hard accusation — `confidence` and `note` make the reasoning legible.
 */
export function suggestAdds(
  incidents: DeathIncident[],
  mobTouches: Map<number, MobTouchInfo>,
  options?: {
    addWindowMs?: number | undefined;
    fightStart?: number | undefined;
    playerNameById?: ReadonlyMap<number, string> | undefined;
    roleById?: ReadonlyMap<number, 'tank' | 'healer' | 'dps' | 'unknown'> | undefined;
  },
): AddSuspicion[] {
  const addWindowMs = options?.addWindowMs ?? DEFAULT_ADD_WINDOW_MS;
  const fightStart = options?.fightStart ?? 0;
  const playerNameById = options?.playerNameById;
  const roleById = options?.roleById;

  const suspects: AddSuspicion[] = [];
  for (const incident of incidents) {
    for (const mobAttack of incident.mobFirstAttacks) {
      const { sourceId: mobId, at } = mobAttack;
      const touch = mobTouches.get(mobId);
      const touchedAtMs =
        touch?.firstTouchedAt !== undefined ? touch.firstTouchedAt - fightStart : undefined;

      const recentAdd =
        touchedAtMs !== undefined &&
        touchedAtMs <= incident.relativeMs &&
        incident.relativeMs - touchedAtMs <= addWindowMs;

      let touchedBy: AddSuspicion['touchedBy'];
      if (touch?.touchedBy) {
        touchedBy = {
          playerId: touch.touchedBy.playerId,
          playerName:
            touch.touchedBy.playerName ||
            playerNameById?.get(touch.touchedBy.playerId) ||
            `#${touch.touchedBy.playerId}`,
          role: touch.touchedBy.role ?? roleById?.get(touch.touchedBy.playerId) ?? 'unknown',
        };
      }

      // Narrative heuristics — all evidence-backed.
      let confidence: AddSuspicion['confidence'] = 'low';
      const notes: string[] = [];
      const firstHitRel = at - fightStart;

      if (recentAdd && touchedBy) {
        if (touchedBy.role === 'tank') {
          confidence = 'medium';
          notes.push(
            `此怪在死亡前 ${(incident.relativeMs - touchedAtMs) / 1000}s 内才被坦克 ${touchedBy.playerName} 首次接触，随后攻击了 ${incident.playerName} —— 新一波小怪刚被拉入（add 波次），坦克未及建立仇恨或聚怪失败。`,
          );
        } else if (touchedBy.role === 'healer') {
          confidence = 'medium';
          notes.push(
            `此怪死亡前 ${(incident.relativeMs - touchedAtMs) / 1000}s 内首次被治疗 ${touchedBy.playerName} 的伤害/技能接触（非坦克先碰怪），随后攻击 ${incident.playerName} —— 疑似治疗引到或怪主动扑向治疗。`,
          );
        } else {
          confidence = 'medium';
          notes.push(
            `此怪死亡前 ${(incident.relativeMs - touchedAtMs) / 1000}s 内首次被 DPS ${touchedBy.playerName} 接触（非坦克先碰怪），随后击杀 ${incident.playerName} —— 疑似 ${touchedBy.playerName} 引到（ADD）。`,
          );
        }
      } else if (!touchedBy) {
        notes.push(
          `此怪攻击 ${incident.playerName} 但全程没有被任何玩家攻击过 —— 巡逻怪主动攻击或路径经过（无法从伤害数据归因责任人）。`,
        );
        confidence = 'low';
      } else if (firstHitRel < (touchedAtMs ?? Infinity)) {
        notes.push(
          `此怪先攻击 ${incident.playerName}（${(firstHitRel / 1000).toFixed(1)}s）后才被 ${
            touchedBy.playerName
          }（${touchedBy.role === 'tank' ? '坦克' : touchedBy.role}）接触 —— 怪主动进战，ADD 责任无法仅凭伤害数据定论。`,
        );
        confidence = 'low';
      }

      if (notes.length === 0) continue;

      suspects.push({
        mobId,
        mobName: touch?.mobName,
        firstTouchedAtMs: touchedAtMs,
        touchedBy,
        firstHitPlayerAtMs: firstHitRel,
        relatedDeathPlayerName: incident.playerName,
        recentAdd,
        confidence,
        note: notes.join(' '),
      });
    }
  }
  return suspects.sort((a, b) => b.firstHitPlayerAtMs - a.firstHitPlayerAtMs);
}
