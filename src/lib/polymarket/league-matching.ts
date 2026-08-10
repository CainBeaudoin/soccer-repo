import { baseNormalize } from './normalize';

/**
 * League-name matching between Polymarket's sidebar and Sportradar's
 * competition list.
 *
 * Competitions collide far more readily than clubs do: "Serie A" exists in
 * Italy and Brazil, "Premier League" in England, Russia and Egypt, "League
 * One" in England and elsewhere. A name alone therefore cannot settle a
 * pairing, so ambiguous names are reported as ambiguous rather than
 * resolved by picking the most famous one.
 */

/** Names that exist in several countries and must never auto-resolve. */
const AMBIGUOUS = new Set([
  'serie a',
  'serie b',
  'premier league',
  'league one',
  'league two',
  'liga 1',
  'primera b',
  'superliga',
  'national league',
  'liga nacional',
  'liga profesional',
  'first division',
  'super league',
]);

/** Polymarket's wording mapped onto Sportradar's, where they differ. */
const LEAGUE_ALIASES: Record<string, string> = {
  'efl championship': 'championship',
  'efl cup': 'carabao cup',
  'laliga2': 'laliga 2',
  'laliga 2': 'segunda division',
  'süper lig': 'super lig',
  'brasileirão série a': 'brasileiro serie a',
  'primeira liga': 'liga portugal',
  'scottish premiership': 'premiership',
  'belgium pro league': 'first division a',
  'chance liga': 'czech liga',
  'niké liga': 'nike liga',
  'efbet liga': 'first professional league',
  'a lyga': 'a lyga',
  'nb i': 'nb i',
  'öfb cup': 'ofb cup',
  'dfb-pokal': 'dfb pokal',
  'trophée des champions': 'trophee des champions',
  'categoría primera a': 'primera a',
  'women’s champions league': 'uefa women s champions league',
  "women's champions league": 'uefa women s champions league',
  'copa libertadores': 'copa libertadores',
};

function canonical(name: string): string {
  const base = baseNormalize(name);
  return LEAGUE_ALIASES[base] ?? base;
}

export type LeagueMatchStatus = 'covered' | 'ambiguous' | 'not_found';

export interface LeagueCoverage {
  polymarketName: string;
  polymarketLabel: string;
  inferred: boolean;
  markets: number | null;
  status: LeagueMatchStatus;
  /** Sportradar competitions consistent with this name. */
  candidates: { id: string; name: string; category: string | null }[];
}

export interface SportradarCompetition {
  id: string;
  name: string;
  category: string | null;
}

function tokens(name: string): string[] {
  return canonical(name).split(' ').filter((t) => t.length > 1);
}

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta.join(' ') === tb.join(' ')) return 1;

  const setA = new Set(ta);
  const setB = new Set(tb);
  const shared = [...setA].filter((t) => setB.has(t)).length;
  if (shared === 0) return 0;

  const shorter = Math.min(ta.length, tb.length);
  const union = new Set([...ta, ...tb]).size;
  // Coverage of the shorter name, tempered by how much the longer one adds.
  return (shared / shorter) * 0.7 + (shared / union) * 0.3;
}

/**
 * Resolves one Polymarket league against Sportradar's competition list.
 * A name shared across countries returns every plausible competition with
 * status "ambiguous" — the country, not the name, is what separates them,
 * and that is a decision to surface rather than guess at.
 */
export function resolveLeague(
  polymarketName: string,
  competitions: SportradarCompetition[],
  threshold = 0.75
): { status: LeagueMatchStatus; candidates: SportradarCompetition[] } {
  const scored = competitions
    .map((competition) => ({ competition, score: similarity(polymarketName, competition.name) }))
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: 'not_found', candidates: [] };

  const isAmbiguousName = AMBIGUOUS.has(canonical(polymarketName));
  const topScore = scored[0].score;
  const tied = scored.filter((s) => s.score >= topScore - 0.001);

  if (isAmbiguousName || tied.length > 1) {
    return {
      status: 'ambiguous',
      // Cap the list: a generic name can match dozens and the point is to
      // show that a choice is needed, not to enumerate every possibility.
      candidates: scored.slice(0, 8).map((s) => s.competition),
    };
  }

  return { status: 'covered', candidates: [scored[0].competition] };
}
