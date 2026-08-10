import { teamSimilarity } from './normalize';

export interface FixtureSide {
  home: string;
  away: string;
  /** ISO kick-off. Optional: some sources omit or approximate it. */
  startTime?: string;
}

export interface FixtureMatch<A, B> {
  a: A;
  b: B;
  score: number;
  /** Kick-off gap in minutes, when both sides supply a time. */
  minutesApart: number | null;
  confidence: 'high' | 'medium' | 'low';
  /** True when the pairing is reversed relative to source A's home/away. */
  swapped: boolean;
}

/** Names must clear this individually before a fixture is considered at all. */
const TEAM_THRESHOLD = 0.6;
/** Combined fixture score required to report a pairing. */
const FIXTURE_THRESHOLD = 0.7;
/** Kick-offs further apart than this are treated as different fixtures. */
const MAX_MINUTES_APART = 240;

function minutesBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / 60_000;
}

/**
 * Scores one candidate pairing. Both teams must match, which is what
 * disambiguates two clubs sharing a city name: "Los Angeles FC vs Seattle"
 * and "Los Angeles Galaxy vs Portland" both look plausible on the first
 * team alone and are separated only by the second.
 */
function scorePairing(a: FixtureSide, b: FixtureSide): { score: number; swapped: boolean } {
  const direct = Math.min(teamSimilarity(a.home, b.home), teamSimilarity(a.away, b.away));
  const reversed = Math.min(teamSimilarity(a.home, b.away), teamSimilarity(a.away, b.home));

  return reversed > direct ? { score: reversed, swapped: true } : { score: direct, swapped: false };
}

/**
 * Cross-references two fixture lists, returning only pairings where both
 * teams agree and the kick-off times are consistent. Each fixture on either
 * side is used at most once, best pairing first, so one Polymarket event
 * cannot be attached to several Sportradar matches.
 */
export function matchFixtures<A extends FixtureSide, B extends FixtureSide>(
  listA: A[],
  listB: B[]
): { matched: FixtureMatch<A, B>[]; unmatchedA: A[]; unmatchedB: B[] } {
  const candidates: FixtureMatch<A, B>[] = [];

  for (const a of listA) {
    for (const b of listB) {
      const { score, swapped } = scorePairing(a, b);
      if (score < TEAM_THRESHOLD) continue;

      const minutesApart = minutesBetween(a.startTime, b.startTime);
      // A confident name match at the wrong time is a different fixture —
      // the same two clubs meet twice a season.
      if (minutesApart !== null && minutesApart > MAX_MINUTES_APART) continue;

      // Agreement in time corroborates the names; absence of a time neither
      // helps nor hurts, so it leaves the name score as-is.
      let combined = score;
      if (minutesApart !== null) {
        const timeBonus = minutesApart <= 30 ? 0.15 : minutesApart <= 120 ? 0.05 : 0;
        combined = Math.min(1, score + timeBonus);
      }

      if (combined < FIXTURE_THRESHOLD) continue;

      const confidence: FixtureMatch<A, B>['confidence'] =
        combined >= 0.9 && (minutesApart === null || minutesApart <= 60)
          ? 'high'
          : combined >= 0.8
            ? 'medium'
            : 'low';

      candidates.push({ a, b, score: combined, minutesApart, confidence, swapped });
    }
  }

  candidates.sort((x, y) => y.score - x.score);

  const usedA = new Set<A>();
  const usedB = new Set<B>();
  const matched: FixtureMatch<A, B>[] = [];

  for (const candidate of candidates) {
    if (usedA.has(candidate.a) || usedB.has(candidate.b)) continue;
    usedA.add(candidate.a);
    usedB.add(candidate.b);
    matched.push(candidate);
  }

  return {
    matched,
    unmatchedA: listA.filter((a) => !usedA.has(a)),
    unmatchedB: listB.filter((b) => !usedB.has(b)),
  };
}
