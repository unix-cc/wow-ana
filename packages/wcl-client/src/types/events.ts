/**
 * WCL EventDataType enum values, as accepted by the live GraphQL schema.
 * Verified against the API (2026-09): `Healing` is the real healing value —
 * `HealingDone` / `HealingTaken` do NOT exist in the server enum and were
 * removed after a live probe rejected them.
 */
export type EventDataType =
  | 'Casts'
  | 'DamageDone'
  | 'DamageTaken'
  | 'Healing'
  | 'Buffs'
  | 'Debuffs'
  | 'Deaths'
  | 'Resources'
  | 'Interrupts'
  | 'Dispels';

export interface EventQuery {
  reportCode: string;
  fightId: number;
  startTime?: number | undefined;
  endTime?: number | undefined;
  sourceId?: number | undefined;
  targetId?: number | undefined;
  abilityId?: number | undefined;
  dataType?: EventDataType | undefined;
  limit?: number | undefined;
  abortSignal?: AbortSignal | undefined;
}

export interface EventsPage<T> {
  events: T[];
  nextPageTimestamp?: number | undefined;
}
