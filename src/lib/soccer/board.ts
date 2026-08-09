import 'server-only';
import {
  findStandingForTeam,
  getDailySchedule,
  getFormStandings,
  getStandings,
  type SportradarCreds,
} from './sportradar';
import { predictMatch, type PredictionResult } from './predict';
import type { ScheduleMatch } from './types';

export interface BoardEntry {
  match: ScheduleMatch;
  prediction: PredictionResult | null;
  /** Why a prediction is missing, when it is. */
  unavailableReason?: string;
}

export interface BoardResponse {
  date: string;
  entries: BoardEntry[];
  /** Every competition on the schedule, for building the filter. */
  competitions: string[];
  seasonsResolved: number;
  seasonsSkipped: number;
}

/**
 * Standings are per season, and every match in a competition shares one, so
 * tables are fetched once per season rather than once per match. Trial keys
 * allow roughly one request per second, so seasons are resolved sequentially
 * with a short pause and an overall cap; matches beyond the cap are returned
 * without a prediction rather than failing the whole board.
 */
const MAX_SEASONS = 10;
const PAUSE_MS = 1100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getBoard(
  date: string,
  creds?: SportradarCreds,
  /** Competition names to price first, so a filtered view is never starved by the cap. */
  preferredCompetitions?: string[]
): Promise<BoardResponse> {
  const schedule = await getDailySchedule(date, creds);

  const bySeason = new Map<string, ScheduleMatch[]>();
  for (const match of schedule.matches) {
    if (!match.seasonId) continue;
    const list = bySeason.get(match.seasonId);
    if (list) list.push(match);
    else bySeason.set(match.seasonId, [match]);
  }

  const preferred = new Set((preferredCompetitions ?? []).map((c) => c.toLowerCase()));
  const isPreferred = (seasonId: string) =>
    preferred.size > 0 &&
    (bySeason.get(seasonId) ?? []).some((m) => preferred.has(m.competitionName.toLowerCase()));

  // Requested competitions first, then the busiest ones, so a capped run
  // always prices what the viewer is actually looking at.
  const seasonIds = [...bySeason.keys()].sort((a, b) => {
    const prefDelta = Number(isPreferred(b)) - Number(isPreferred(a));
    if (prefDelta !== 0) return prefDelta;
    return (bySeason.get(b)?.length ?? 0) - (bySeason.get(a)?.length ?? 0);
  });

  const predictions = new Map<string, PredictionResult>();
  let seasonsResolved = 0;
  let seasonsSkipped = 0;

  for (const seasonId of seasonIds) {
    if (seasonsResolved >= MAX_SEASONS) {
      seasonsSkipped++;
      continue;
    }

    if (seasonsResolved > 0) await sleep(PAUSE_MS);

    try {
      const [standings, form] = await Promise.all([
        getStandings(seasonId, creds),
        getFormStandings(seasonId, creds),
      ]);

      for (const match of bySeason.get(seasonId) ?? []) {
        const homeStanding = findStandingForTeam(standings, match.home.id);
        const awayStanding = findStandingForTeam(standings, match.away.id);
        if (homeStanding && form.has(match.home.id)) homeStanding.form = form.get(match.home.id);
        if (awayStanding && form.has(match.away.id)) awayStanding.form = form.get(match.away.id);

        predictions.set(
          match.id,
          predictMatch(
            homeStanding ?? match.home,
            awayStanding ?? match.away,
            homeStanding,
            awayStanding
          )
        );
      }
      seasonsResolved++;
    } catch {
      // One competition's table failing must not sink the whole board.
      seasonsSkipped++;
    }
  }

  const entries: BoardEntry[] = schedule.matches.map((match) => {
    const prediction = predictions.get(match.id) ?? null;
    return {
      match,
      prediction,
      unavailableReason: prediction
        ? undefined
        : match.seasonId
          ? 'Standings unavailable for this competition.'
          : 'No season data for this match.',
    };
  });

  const competitions = [...new Set(schedule.matches.map((m) => m.competitionName))].sort((a, b) =>
    a.localeCompare(b)
  );

  return { date: schedule.date, entries, competitions, seasonsResolved, seasonsSkipped };
}
