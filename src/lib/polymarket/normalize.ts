/**
 * Club-name normalisation for cross-referencing Polymarket against
 * Sportradar. The two sources name the same club differently — "FC Bayern
 * München" against "Bayern Munich", "Spurs" against "Tottenham Hotspur" —
 * so names are reduced to a comparable core before similarity is measured.
 *
 * The hard constraint is asymmetric: a missed match costs a row on a
 * screen, but a wrong match attaches a prediction to the wrong fixture.
 * Everything here is biased towards refusing rather than guessing.
 */

/**
 * Legal and corporate affixes only. Words that distinguish one club from
 * another in the same city — City, United, Real, Wednesday — are deliberately
 * NOT in this list: dropping them collapses Manchester City into Manchester
 * United, which is the exact failure this matcher exists to avoid.
 */
const AFFIXES = new Set([
  'fc', 'afc', 'cf', 'sc', 'ac', 'ss', 'as', 'sv', 'tsv', 'vfb', 'vfl', 'bsc',
  'fsv', 'sd', 'ud', 'rc', 'cd', 'ca', 'sk', 'sl', 'cp', 'club', 'calcio',
  'futbol', 'football', 'clube', 'de', 'do', 'da', 'du', 'the',
]);

/**
 * Short forms and popular names sharing no tokens with the formal name, so
 * no string similarity could connect them.
 */
const ALIASES: Record<string, string> = {
  spurs: 'tottenham hotspur',
  psg: 'paris saint germain',
  psv: 'psv eindhoven',
  inter: 'internazionale milano',
  intermilan: 'internazionale milano',
  juve: 'juventus',
  barca: 'barcelona',
  bayern: 'bayern munchen',
  bayernmunich: 'bayern munchen',
  munich: 'munchen',
  bvb: 'borussia dortmund',
  gladbach: 'borussia monchengladbach',
  wolves: 'wolverhampton wanderers',
  atleti: 'atletico madrid',
  utd: 'united',
  man: 'manchester',
  mancity: 'manchester city',
  manutd: 'manchester united',
  manunited: 'manchester united',
  nottm: 'nottingham',
  sheff: 'sheffield',
  weds: 'wednesday',
  // Joined-form entries only — matched against the whole name, never a
  // single token, so Spanish names like "Deportivo La Coruña" are untouched
  // by the "LA" of American clubs.
  lafc: 'los angeles football club',
  lagalaxy: 'los angeles galaxy',
  nycfc: 'new york city football club',
  nyrb: 'new york red bulls',
  dcunited: 'dc united',
  interminami: 'inter miami',
};

export function baseNormalize(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function applyAliases(tokens: string[]): string[] {
  const joined = tokens.join('');
  if (ALIASES[joined]) return baseNormalize(ALIASES[joined]).split(' ');

  const out: string[] = [];
  for (const token of tokens) {
    if (ALIASES[token]) out.push(...baseNormalize(ALIASES[token]).split(' '));
    else out.push(token);
  }
  return out;
}

export interface NormalizedName {
  tokens: string[];
  raw: string;
}

export function normalizeTeam(name: string): NormalizedName {
  const tokens = applyAliases(baseNormalize(name).split(' ').filter(Boolean));
  const meaningful = tokens.filter((t) => !AFFIXES.has(t) && t.length > 1);
  return { tokens: meaningful.length > 0 ? meaningful : tokens, raw: name };
}

/**
 * Similarity in [0,1].
 *
 * The decisive rule is the leftover test. After removing shared tokens, if
 * BOTH names still carry meaningful tokens of their own, they name different
 * clubs — "Manchester [City]" against "Manchester [United]", "Sheffield
 * [United]" against "Sheffield [Wednesday]". If only ONE side has leftovers,
 * the shorter name is an abbreviation of the longer — "Brighton" against
 * "Brighton [Hove Albion]" — and scores as a match.
 *
 * Known limitation: two distinct clubs whose names differ only by a suffix
 * one source omits (Los Angeles FC against Los Angeles Galaxy) are
 * indistinguishable by name alone. Those are resolved by requiring the
 * opponent to match too and the kick-off times to agree — see matchFixtures.
 */
export function teamSimilarity(a: string, b: string): number {
  const ta = normalizeTeam(a).tokens;
  const tb = normalizeTeam(b).tokens;
  if (ta.length === 0 || tb.length === 0) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);

  if (ta.join(' ') === tb.join(' ')) return 1;

  const shared = [...setA].filter((t) => setB.has(t));
  if (shared.length === 0) return 0;

  const leftoverA = [...setA].filter((t) => !setB.has(t));
  const leftoverB = [...setB].filter((t) => !setA.has(t));

  // Both sides carry distinct identity tokens: different clubs.
  if (leftoverA.length > 0 && leftoverB.length > 0) {
    const jaccard = shared.length / new Set([...ta, ...tb]).size;
    // Capped well below any usable threshold — reported, never matched.
    return Math.min(0.45, jaccard);
  }

  // One side is a subset of the other: an abbreviation of the same club.
  const [shortLen, longLen] = ta.length <= tb.length ? [ta.length, tb.length] : [tb.length, ta.length];
  const coverage = shared.length / shortLen;
  // Slight penalty as the longer name adds words, so a single shared token
  // against a much longer name stays below a bare-subset match.
  const lengthPenalty = 1 - Math.min(0.25, (longLen - shortLen) * 0.08);
  return Math.min(1, coverage * lengthPenalty);
}
