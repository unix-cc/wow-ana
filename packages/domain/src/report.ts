export type GameDifficulty = 'N' | 'H' | 'M' | number;

export interface Zone {
  id: number;
  name: string;
  frozen?: boolean;
  bracket?: number;
}

export interface Report {
  code: string;
  title?: string | undefined;
  owner?: string | undefined;
  startTime: number;
  endTime: number;
  zone: Zone;
  fights?: Fight[] | undefined;
}

export interface Fight {
  id: number;
  name: string;
  startTime: number;
  endTime: number;
  boss?: number | undefined;
  kill?: boolean | undefined;
  difficulty?: GameDifficulty | undefined;
  zoneId?: number | undefined;
  size?: number | undefined;
}
