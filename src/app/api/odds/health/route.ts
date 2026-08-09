import { NextRequest, NextResponse } from 'next/server';
import { getBooks, getSports, oddsConfigStatus, probeVariants } from '@/lib/odds/client';
import { SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

export const dynamic = 'force-dynamic';

/**
 * Verifies the key reaches the Odds Comparison product on the configured
 * URL line. Because Sportradar answers both a missing entitlement and a
 * wrong path with 403, a failure here re-runs as a probe across the
 * plausible base/version/access-level combinations and reports which one
 * works — turning a guess into a definite next step.
 *
 * Pass ?probe=1 to run the probe even when the configured line works.
 */
export async function GET(request: NextRequest) {
  const creds = credsFromRequest(request);
  const status = oddsConfigStatus(creds);
  const forceProbe = new URL(request.url).searchParams.get('probe') === '1';

  if (!status.apiKeyPresent) {
    return NextResponse.json(
      { ok: false, problem: 'missing_api_key', detail: 'No API key supplied.', config: status },
      { status: 400 }
    );
  }

  try {
    const books = await getBooks(creds);
    let sportsNote = '';
    try {
      const sports = await getSports(creds);
      sportsNote = ` ${sports.length} sport(s) available.`;
    } catch {
      sportsNote = ' Books reachable, but the sports list was not — search may be limited.';
    }

    return NextResponse.json({
      ok: true,
      detail: `Odds Comparison reachable. ${books.length} bookmaker(s) in the panel.${sportsNote}`,
      config: status,
      probe: forceProbe ? await probeVariants(creds) : undefined,
    });
  } catch (error) {
    const httpStatus = error instanceof SportradarError ? error.status : 502;
    let problem = 'request_failed';
    if (httpStatus === 401 || httpStatus === 403) problem = 'denied_or_wrong_url_line';
    else if (httpStatus === 404) problem = 'wrong_base_or_version';

    // Only probe when the failure is one the probe can actually explain.
    const shouldProbe = httpStatus === 401 || httpStatus === 403 || httpStatus === 404;
    let probe;
    if (shouldProbe) {
      try {
        probe = await probeVariants(creds);
      } catch {
        probe = undefined;
      }
    }

    const working = probe?.find((p) => p.ok);

    return NextResponse.json(
      {
        ok: false,
        problem,
        detail: error instanceof Error ? error.message : 'Unknown error.',
        recommendation: working
          ? `A working URL line was found: set SPORTRADAR_ODDS_BASE=${working.base}, SPORTRADAR_ODDS_VERSION=${working.version}, SPORTRADAR_ACCESS_LEVEL=${working.accessLevel}.`
          : probe
            ? 'No URL line worked, so the key almost certainly lacks the Odds Comparison entitlement. That is enabled per product on the Sportradar account, not fixable in this app.'
            : undefined,
        config: status,
        probe,
      },
      { status: httpStatus }
    );
  }
}
