import { NextRequest, NextResponse } from 'next/server';
import { getCompetitions, SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';
import { duplicateLabels, uniqueLeagues } from '@/lib/polymarket/leagues';
import { resolveLeague, type LeagueCoverage } from '@/lib/polymarket/league-matching';

export const dynamic = 'force-dynamic';

/**
 * Cross-references Polymarket's league list against the competitions this
 * key can actually see, so the tradable-and-modellable overlap is a fact
 * rather than an assumption.
 */
export async function GET(request: NextRequest) {
  try {
    const competitions = await getCompetitions(credsFromRequest(request));
    const leagues = uniqueLeagues();

    const rows: LeagueCoverage[] = leagues.map((league) => {
      const { status, candidates } = resolveLeague(league.name, competitions);
      return {
        polymarketName: league.name,
        polymarketLabel: league.label,
        inferred: league.inferred,
        markets: league.markets,
        status,
        candidates,
      };
    });

    // Most tradable first — a league with 300 markets matters more than one
    // with a single market, whatever the alphabet says.
    rows.sort((a, b) => (b.markets ?? 0) - (a.markets ?? 0));

    const counts = {
      total: rows.length,
      covered: rows.filter((r) => r.status === 'covered').length,
      ambiguous: rows.filter((r) => r.status === 'ambiguous').length,
      notFound: rows.filter((r) => r.status === 'not_found').length,
      competitionsAvailable: competitions.length,
    };

    return NextResponse.json({ counts, rows, duplicateLabels: duplicateLabels() });
  } catch (error) {
    const status = error instanceof SportradarError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unknown error building coverage.';
    return NextResponse.json({ error: message }, { status });
  }
}
