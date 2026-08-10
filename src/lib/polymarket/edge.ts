import 'server-only';
import { getBoard } from '@/lib/soccer/board';
import type { SportradarCreds } from '@/lib/soccer/sportradar';
import { getSoccerGames, type PolymarketGame } from './client';
import { matchFixtures, type FixtureMatch } from './matching';
import { teamSimilarity } from './normalize';
import type { PredictionResult } from '@/lib/soccer/predict';
import type { ScheduleMatch } from '@/lib/soccer/types';

export interface EdgeOutcome {
  label: string;
  /** This app's model probability, 0-100. */
  model: number | null;
  /** Polymarket's price as a probability, 0-100. */
  market: number | null;
  /** model - market, in points. Positive means the model is higher. */
  difference: number | null;
}

export interface EdgeRow {
  polymarket: { id: string; title: string; url: string; startTime?: string; volume: number | null };
  fixture: { id: string; home: string; away: string; competition: string; scheduled: string };
  prediction: PredictionResult | null;
  outcomes: EdgeOutcome[];
  /** Largest absolute model-vs-market gap across outcomes, in points. */
  biggestDivergence: number | null;
  confidence: FixtureMatch<never, never>['confidence'];
  matchScore: number;
  minutesApart: number | null;
}

export interface EdgeReport {
  date: string;
  rows: EdgeRow[];
  /** Polymarket games with no counterpart in the Sportradar schedule. */
  unmatchedPolymarket: { id: string; title: string; url: string; startTime?: string }[];
  counts: { polymarketGames: number; scheduleMatches: number; paired: number };
}

interface PolySide {
  home: string;
  away: string;
  startTime?: string;
  game: PolymarketGame;
}

interface SrSide {
  home: string;
  away: string;
  startTime?: string;
  match: ScheduleMatch;
  prediction: PredictionResult | null;
}

/**
 * Aligns a Polymarket outcome label to the model's home/draw/away view.
 * Polymarket labels outcomes with the team's own name, so the mapping is by
 * name similarity rather than position — the two sources do not agree on
 * which side is listed first.
 */
function alignOutcomes(
  game: PolymarketGame,
  fixture: ScheduleMatch,
  prediction: PredictionResult | null
): EdgeOutcome[] {
  const out: EdgeOutcome[] = [];

  for (const outcome of game.outcomes) {
    const label = outcome.label.trim();
    const market = outcome.price !== null ? Math.round(outcome.price * 1000) / 10 : null;

    let model: number | null = null;
    if (prediction) {
      if (/^(draw|tie)$/i.test(label)) {
        model = prediction.probabilities.draw;
      } else {
        const toHome = teamSimilarity(label, fixture.home.name);
        const toAway = teamSimilarity(label, fixture.away.name);
        if (toHome >= 0.6 && toHome >= toAway) model = prediction.probabilities.home;
        else if (toAway >= 0.6) model = prediction.probabilities.away;
      }
    }

    out.push({
      label,
      model,
      market,
      difference: model !== null && market !== null ? Math.round((model - market) * 10) / 10 : null,
    });
  }

  return out;
}

/**
 * Cross-references Polymarket's upcoming soccer games against the fixtures
 * this app can price, so the set of games that are both tradable and
 * modelled is visible in one place — rather than being rediscovered by
 * reading two lists side by side.
 */
export async function buildEdgeReport(date: string, creds?: SportradarCreds): Promise<EdgeReport> {
  const [board, games] = await Promise.all([getBoard(date, creds), getSoccerGames()]);

  const polySides: PolySide[] = games.map((game) => ({
    home: game.home,
    away: game.away,
    startTime: game.startTime,
    game,
  }));

  const srSides: SrSide[] = board.entries.map((entry) => ({
    home: entry.match.home.name,
    away: entry.match.away.name,
    startTime: entry.match.scheduled,
    match: entry.match,
    prediction: entry.prediction,
  }));

  const { matched, unmatchedA } = matchFixtures(polySides, srSides);

  const rows: EdgeRow[] = matched.map((m) => {
    const outcomes = alignOutcomes(m.a.game, m.b.match, m.b.prediction);
    const diffs = outcomes
      .map((o) => (o.difference === null ? null : Math.abs(o.difference)))
      .filter((d): d is number => d !== null);

    return {
      polymarket: {
        id: m.a.game.id,
        title: m.a.game.title,
        url: m.a.game.url,
        startTime: m.a.game.startTime,
        volume: m.a.game.volume,
      },
      fixture: {
        id: m.b.match.id,
        home: m.b.match.home.name,
        away: m.b.match.away.name,
        competition: m.b.match.competitionName,
        scheduled: m.b.match.scheduled,
      },
      prediction: m.b.prediction,
      outcomes,
      biggestDivergence: diffs.length > 0 ? Math.max(...diffs) : null,
      confidence: m.confidence,
      matchScore: Math.round(m.score * 100) / 100,
      minutesApart: m.minutesApart,
    };
  });

  // Largest disagreement first — that is the reason to look at this at all.
  rows.sort((a, b) => (b.biggestDivergence ?? -1) - (a.biggestDivergence ?? -1));

  return {
    date,
    rows,
    unmatchedPolymarket: unmatchedA.map((p) => ({
      id: p.game.id,
      title: p.game.title,
      url: p.game.url,
      startTime: p.game.startTime,
    })),
    counts: {
      polymarketGames: games.length,
      scheduleMatches: board.entries.length,
      paired: rows.length,
    },
  };
}
