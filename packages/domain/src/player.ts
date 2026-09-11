export type ActorType = 'Player' | 'NPC' | 'Boss' | 'Pet';

export interface Player {
  id: number;
  name: string;
  classId?: number | undefined;
  className?: string | undefined;
  specId?: number | undefined;
  specName?: string | undefined;
  type: ActorType;
  server?: string | undefined;
  petOwnerId?: number | undefined;
  subType?: string | undefined;
}

export type Actor = Player;
