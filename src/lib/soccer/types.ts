export interface CompetitorRef {
  id: string;
  name: string;
  abbreviation: string;
}

export interface ScheduleMatch {
  id: string;
  status: string;
  scheduled: string;
  competitionName: string;
  seasonId: string | null;
  home: CompetitorRef;
  away: CompetitorRef;
  homeScore?: number;
  awayScore?: number;
}

export interface ScheduleResponse {
  date: string;
  matches: ScheduleMatch[];
}

export interface TeamStanding extends CompetitorRef {
  rank: number | null;
  played: number;
  win: number;
  draw: number;
  loss: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Chronological, oldest → newest, e.g. "LDWWW". Undefined if unavailable. */
  form?: string;
}
