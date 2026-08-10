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
  mls: 'major league soccer',
  ucl: 'uefa champions league',
  uel: 'uefa europa league',
  nwsl: 'national womens soccer league',
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
  // Digits are kept: they are the tier, and dropping them makes "Ligue 1"
  // and "Ligue 2" — or "Bundesliga" and "2. Bundesliga" — identical.
  return canonical(name)
    .split(' ')
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/** The tier number in a league name, e.g. 2 in "Ligue 2" or "2. Bundesliga". */
function tierOf(name: string): number | null {
  const found = canonical(name).match(/\b(\d{1,2})\b/);
  if (found) return Number(found[1]);
  // "LaLiga2" / "K League 2" style, where the digit is glued to a word.
  const glued = canonical(name).match(/[a-z](\d)\b/);
  return glued ? Number(glued[1]) : null;
}

/** Age-restricted competitions are separate from the senior game. */
function ageGroupOf(name: string): string | null {
  const found = canonical(name).match(/\bu\s?(\d{2})\b/);
  return found ? `u${found[1]}` : null;
}

function similarity(a: string, b: string): number {
  // An age-restricted competition never corresponds to a senior one, and
  // "U19 Bundesliga" otherwise scores as a near-perfect match for
  // "Bundesliga" on shared tokens alone.
  if (ageGroupOf(a) !== ageGroupOf(b)) return 0;

  // Differing tiers are different competitions, however similar the words.
  const tierA = tierOf(a);
  const tierB = tierOf(b);
  if (tierA !== null && tierB !== null && tierA !== tierB) return 0;
  // One side naming a tier and the other not is also a mismatch: "Ligue 1"
  // must not fall back to a bare "Ligue".
  if ((tierA === null) !== (tierB === null)) return 0;

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
 * The reverse direction: given a Sportradar competition, find the
 * Polymarket league it corresponds to, or null if Polymarket does not list
 * it. Used to restrict the board to fixtures that are actually tradable,
 * so nothing is shown that cannot be acted on.
 *
 * Ambiguity is resolved permissively here, unlike in resolveLeague. A
 * competition matching any listed league is kept, because the cost of the
 * two errors is asymmetric in this direction: wrongly hiding a fixture
 * removes it from view with no trace, while wrongly keeping one is visible
 * — the league it matched is shown on the row, so a bad pairing can be
 * spotted and corrected.
 */
export function competitionToPolymarketLeague(
  competitionName: string,
  leagues: { name: string }[],
  threshold = 0.75
): string | null {
  let best: { name: string; score: number } | null = null;

  for (const league of leagues) {
    const score = similarity(competitionName, league.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { name: league.name, score };
    }
  }

  return best?.name ?? null;
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
