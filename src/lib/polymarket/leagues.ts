/**
 * Polymarket's soccer league list, transcribed from the site's league
 * sidebar (screenshots, since the API is not reachable from the build
 * environment).
 *
 * `label` is exactly what Polymarket displays. Where the sidebar truncates
 * a name with an ellipsis, `label` keeps the visible text, `name` carries
 * the expansion, and `inferred` marks that the expansion is a reading of a
 * cut-off string rather than something observed in full — so a wrong guess
 * is visible as a guess instead of silently becoming ground truth.
 *
 * `markets` is the count Polymarket showed beside the league, which is a
 * rough proxy for how much is actually tradable there.
 */
export interface PolymarketLeague {
  label: string;
  name: string;
  inferred: boolean;
  markets: number | null;
  /** Which screenshot it came from, for reconciling later corrections. */
  source: number;
}

export const POLYMARKET_LEAGUES: PolymarketLeague[] = [
  // ── Screenshot 1 ────────────────────────────────────────────────────
  { label: 'Community ...', name: 'Community Shield', inferred: true, markets: 1, source: 1 },
  { label: 'Challenger P...', name: 'Challenger Pro League', inferred: true, markets: 1, source: 1 },
  { label: 'Bundesliga', name: 'Bundesliga', inferred: false, markets: 1, source: 1 },
  { label: 'Liga Profesio...', name: 'Liga Profesional', inferred: true, markets: 156, source: 1 },
  { label: 'EFL CUP', name: 'EFL Cup', inferred: false, markets: 12, source: 1 },
  { label: 'King Cup', name: 'King Cup', inferred: false, markets: 112, source: 1 },
  { label: 'Scottish Cup', name: 'Scottish Cup', inferred: false, markets: 141, source: 1 },
  { label: 'Trophée des ...', name: 'Trophée des Champions', inferred: true, markets: 1, source: 1 },
  { label: 'Egyptian Pre...', name: 'Egyptian Premier League', inferred: true, markets: 50, source: 1 },
  { label: 'Erovnuli Liga', name: 'Erovnuli Liga', inferred: false, markets: null, source: 1 },
  { label: 'ASEAN Cham...', name: 'ASEAN Championship', inferred: true, markets: null, source: 1 },

  // ── Screenshot 2 ────────────────────────────────────────────────────
  { label: 'Saudi Pro Le...', name: 'Saudi Pro League', inferred: true, markets: 126, source: 2 },
  { label: 'Serie A', name: 'Serie A', inferred: false, markets: 52, source: 2 },
  { label: 'League One', name: 'League One', inferred: false, markets: 168, source: 2 },
  { label: 'TFF Süper K...', name: 'TFF Süper Kupa', inferred: true, markets: 1, source: 2 },
  { label: 'National Lea...', name: 'National League', inferred: true, markets: 178, source: 2 },
  { label: 'Chance Liga', name: 'Chance Liga', inferred: false, markets: 82, source: 2 },
  { label: 'Süper Lig', name: 'Süper Lig', inferred: false, markets: 102, source: 2 },
  { label: 'Swiss Super ...', name: 'Swiss Super League', inferred: true, markets: 4, source: 2 },
  { label: 'League Two', name: 'League Two', inferred: false, markets: 168, source: 2 },
  { label: 'Premium Liiga', name: 'Premium Liiga', inferred: false, markets: 4, source: 2 },
  { label: 'Greek Cup', name: 'Greek Cup', inferred: false, markets: 7, source: 2 },
  { label: 'Serie B', name: 'Serie B', inferred: false, markets: 42, source: 2 },
  { label: 'Venezuelan ...', name: 'Venezuelan Primera División', inferred: true, markets: 2, source: 2 },
  { label: 'Copa Argent...', name: 'Copa Argentina', inferred: true, markets: 1, source: 2 },

  // ── Screenshot 3 ────────────────────────────────────────────────────
  { label: 'Betri deildin', name: 'Betri deildin', inferred: false, markets: 2, source: 3 },
  { label: 'Ligue 2', name: 'Ligue 2', inferred: false, markets: 127, source: 3 },
  { label: 'Brasileirão S...', name: 'Brasileirão Série A', inferred: true, markets: 2, source: 3 },
  { label: 'Australia Cup', name: 'Australia Cup', inferred: false, markets: 39, source: 3 },
  { label: 'Scottish Pre...', name: 'Scottish Premiership', inferred: true, markets: 45, source: 3 },
  { label: 'Coppa Italia', name: 'Coppa Italia', inferred: false, markets: 106, source: 3 },
  { label: 'Turkey 1. Lig', name: 'Turkey 1. Lig', inferred: false, markets: 1, source: 3 },
  { label: 'Serbian Sup...', name: 'Serbian SuperLiga', inferred: true, markets: 14, source: 3 },
  { label: 'A Lyga', name: 'A Lyga', inferred: false, markets: 1, source: 3 },
  { label: 'LaLiga2', name: 'LaLiga2', inferred: false, markets: 111, source: 3 },
  { label: '2. Bundesliga', name: '2. Bundesliga', inferred: false, markets: 65, source: 3 },
  { label: 'Eerste Divisie', name: 'Eerste Divisie', inferred: false, markets: 3, source: 3 },
  { label: 'Uzbekistan ...', name: 'Uzbekistan Super League', inferred: true, markets: 5, source: 3 },
  { label: 'Ligue 1', name: 'Ligue 1', inferred: false, markets: 42, source: 3 },
  { label: 'Liga 1', name: 'Liga 1', inferred: false, markets: 83, source: 3 },

  // ── Screenshot 4 ────────────────────────────────────────────────────
  { label: 'Superettan', name: 'Superettan', inferred: false, markets: 6, source: 4 },
  { label: 'EFL Champi...', name: 'EFL Championship', inferred: true, markets: 161, source: 4 },
  { label: 'Virslīga', name: 'Virslīga', inferred: false, markets: 1, source: 4 },
  { label: 'J2 League', name: 'J2 League', inferred: false, markets: 151, source: 4 },
  { label: 'DFB-Pokal', name: 'DFB-Pokal', inferred: false, markets: 181, source: 4 },
  { label: 'Categoría Pri...', name: 'Categoría Primera A', inferred: true, markets: 3, source: 4 },
  { label: 'League of Ir...', name: 'League of Ireland', inferred: true, markets: 9, source: 4 },
  { label: 'Slovenia Prv...', name: 'Slovenia PrvaLiga', inferred: true, markets: 1, source: 4 },
  { label: 'Scotland Lea...', name: 'Scotland League One', inferred: true, markets: 4, source: 4 },
  { label: 'Belgium Pro ...', name: 'Belgium Pro League', inferred: true, markets: 9, source: 4 },
  { label: 'Veikkausliiga', name: 'Veikkausliiga', inferred: false, markets: 8, source: 4 },
  { label: 'ÖFB Cup', name: 'ÖFB Cup', inferred: false, markets: 7, source: 4 },
  { label: 'NB I', name: 'NB I', inferred: false, markets: 5, source: 4 },
  { label: 'Premier Lea...', name: 'Premier League', inferred: true, markets: 42, source: 4 },
  { label: 'SuperLiga', name: 'SuperLiga', inferred: false, markets: 55, source: 4 },

  // ── Screenshot 5 ────────────────────────────────────────────────────
  { label: 'efbet Liga', name: 'efbet Liga', inferred: false, markets: 3, source: 5 },
  { label: 'Besta deild k...', name: 'Besta deild karla', inferred: true, markets: 1, source: 5 },
  { label: 'OBOS-ligaen', name: 'OBOS-ligaen', inferred: false, markets: 1, source: 5 },
  { label: 'Liga Nacion...', name: 'Liga Nacional', inferred: true, markets: 86, source: 5 },
  { label: 'Kazakhstan ...', name: 'Kazakhstan Premier League', inferred: true, markets: 2, source: 5 },
  { label: 'Niké liga', name: 'Niké liga', inferred: false, markets: 93, source: 5 },
  { label: 'USL Champi...', name: 'USL Championship', inferred: true, markets: 12, source: 5 },
  { label: 'Ekstraklasa', name: 'Ekstraklasa', inferred: false, markets: 2, source: 5 },
  { label: "Women's Ch...", name: "Women's Champions League", inferred: true, markets: 28, source: 5 },
  { label: 'Primeira Liga', name: 'Primeira Liga', inferred: false, markets: 109, source: 5 },
  { label: 'Primera B (C...', name: 'Primera B (Colombia)', inferred: true, markets: 1, source: 5 },
  { label: 'Copa Liberta...', name: 'Copa Libertadores', inferred: true, markets: 112, source: 5 },
  { label: 'Eredivisie', name: 'Eredivisie', inferred: false, markets: 104, source: 5 },
  { label: 'China Leagu...', name: 'China League One', inferred: true, markets: 1, source: 5 },
  { label: 'J1 League', name: 'J1 League', inferred: false, markets: 147, source: 5 },

  // ── Screenshot 6 ────────────────────────────────────────────────────
  { label: 'NWSL', name: 'NWSL', inferred: false, markets: 118, source: 6 },
  { label: 'Bolivian Prim...', name: 'Bolivian Primera División', inferred: true, markets: 82, source: 6 },
  { label: 'Liga FPD', name: 'Liga FPD', inferred: false, markets: 67, source: 6 },
  { label: 'UEFA Confer...', name: 'UEFA Conference League', inferred: true, markets: 180, source: 6 },
  { label: 'Brasileirão S...', name: 'Brasileirão Série B', inferred: true, markets: 133, source: 6 },
  { label: 'K League 1', name: 'K League 1', inferred: false, markets: 95, source: 6 },
  { label: 'Liga MX', name: 'Liga MX', inferred: false, markets: 114, source: 6 },
  { label: 'LaLiga', name: 'LaLiga', inferred: false, markets: 84, source: 6 },
  { label: 'Prva Liga', name: 'Prva Liga', inferred: false, markets: 62, source: 6 },
  { label: 'LigaPro Seri...', name: 'LigaPro Serie A', inferred: true, markets: 4, source: 6 },
  { label: 'Primera Naci...', name: 'Primera Nacional', inferred: true, markets: 4, source: 6 },
  { label: 'Austria Bund...', name: 'Austrian Bundesliga', inferred: true, markets: 2, source: 6 },
  { label: 'USL League ...', name: 'USL League One', inferred: true, markets: 3, source: 6 },
  { label: 'Ukrainian Pr...', name: 'Ukrainian Premier League', inferred: true, markets: 87, source: 6 },
  { label: 'Copa Sudam...', name: 'Copa Sudamericana', inferred: true, markets: 116, source: 6 },

  // ── Screenshot 7 ────────────────────────────────────────────────────
  { label: 'Leagues Cup', name: 'Leagues Cup', inferred: false, markets: 161, source: 7 },
  { label: 'UEL', name: 'UEFA Europa League', inferred: true, markets: 103, source: 7 },
  { label: 'MLS', name: 'Major League Soccer', inferred: true, markets: 320, source: 7 },
  { label: 'Brasileirão S...', name: 'Brasileirão Série C', inferred: true, markets: 126, source: 7 },
  { label: 'Club Friendlies', name: 'Club Friendlies', inferred: false, markets: 34, source: 7 },
  { label: 'Categoría Pri...', name: 'Categoría Primera B', inferred: true, markets: 118, source: 7 },
  { label: 'K League 2', name: 'K League 2', inferred: false, markets: 4, source: 7 },
  { label: 'Allsvenskan', name: 'Allsvenskan', inferred: false, markets: 5, source: 7 },
  { label: 'Liga de Prim...', name: 'Liga de Primera', inferred: true, markets: 80, source: 7 },
  { label: 'Eliteserien', name: 'Eliteserien', inferred: false, markets: 57, source: 7 },
  { label: 'UCL', name: 'UEFA Champions League', inferred: true, markets: 81, source: 7 },
  { label: 'Uruguayan P...', name: 'Uruguayan Primera División', inferred: true, markets: 7, source: 7 },
  { label: 'Danish Supe...', name: 'Danish Superliga', inferred: true, markets: 86, source: 7 },
  { label: 'Chinese Sup...', name: 'Chinese Super League', inferred: true, markets: 133, source: 7 },
];

/**
 * Truncated labels that appear more than once are distinct leagues sharing
 * a visible prefix — "Brasileirão S..." is Série A, B and C, each with its
 * own market count. Merging them by label would silently drop two real
 * leagues, so repeats are surfaced for confirmation instead.
 */
export function duplicateLabels(): { label: string; entries: PolymarketLeague[] }[] {
  const byLabel = new Map<string, PolymarketLeague[]>();
  for (const league of POLYMARKET_LEAGUES) {
    const list = byLabel.get(league.label);
    if (list) list.push(league);
    else byLabel.set(league.label, [league]);
  }
  return [...byLabel.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([label, entries]) => ({ label, entries }));
}

/**
 * De-duplicates only genuine repeats — the same league listed twice, such as
 * "Community Shield" appearing in both screenshot 1 and 2 with the same
 * count. Entries sharing a truncated label but differing in market count are
 * different leagues and are kept apart.
 */
export function uniqueLeagues(): PolymarketLeague[] {
  const seen = new Map<string, PolymarketLeague>();
  for (const league of POLYMARKET_LEAGUES) {
    const key = `${league.name.toLowerCase()}|${league.markets ?? 'none'}`;
    if (!seen.has(key)) seen.set(key, league);
  }
  return [...seen.values()];
}
