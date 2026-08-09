export interface OddsSport {
  id: string;
  name: string;
}

export interface OddsCompetitor {
  id: string;
  name: string;
  qualifier: 'home' | 'away' | null;
}

export interface OddsSportEvent {
  id: string;
  name: string;
  startTime: string;
  sportId: string;
  sportName: string;
  competitionName: string | null;
  competitors: OddsCompetitor[];
}

export interface OddsOutcome {
  /** "home" / "draw" / "away" where derivable, else the raw outcome label. */
  type: string;
  label: string;
  /** Decimal odds, e.g. 2.50. */
  price: number | null;
  /** Share of the market implied by the price, before removing the margin. */
  rawProbability: number | null;
}

export interface ConsensusMarket {
  name: string;
  bookmakerCount: number;
  outcomes: OddsOutcome[];
  /** Total implied probability; above 1 by the bookmaker margin. */
  overround: number | null;
}

export interface MatchOdds {
  sportEventId: string;
  markets: ConsensusMarket[];
}
