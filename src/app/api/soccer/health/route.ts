import { NextResponse } from 'next/server';
import { configStatus, getCompetitionInfo, getDailySchedule, SportradarError } from '@/lib/soccer/sportradar';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint: reports whether the API key reached the server and
 * what Sportradar actually said back, so a misconfiguration can be told
 * apart from a bad key or a wrong access level without reading logs.
 * Never returns the key itself — only whether one is present and its length.
 */
export async function GET() {
  const status = configStatus();

  if (!status.apiKeyPresent) {
    return NextResponse.json(
      {
        ok: false,
        problem: 'missing_api_key',
        detail:
          'SPORTRADAR_SOCCER_API_KEY is not visible to the server. On Vercel: Settings → Environment Variables → add it with the Production scope checked, then redeploy (existing deployments do not pick up newly added variables).',
        config: status,
      },
      { status: 500 }
    );
  }

  // The key is present — validate it against competition info first, which
  // always returns a payload, then report today's schedule volume separately
  // so an empty schedule is never mistaken for an auth failure.
  const today = new Date().toISOString().slice(0, 10);
  try {
    const competition = await getCompetitionInfo();
    let scheduleNote: string;
    try {
      const schedule = await getDailySchedule(today);
      scheduleNote = `${schedule.matches.length} match(es) listed for ${today}.`;
    } catch (scheduleError) {
      scheduleNote = `Key is valid, but the schedule call failed: ${
        scheduleError instanceof Error ? scheduleError.message : 'unknown error'
      }`;
    }

    return NextResponse.json({
      ok: true,
      detail: `Sportradar accepted the key (read "${competition.name ?? 'competition'}"). ${scheduleNote}`,
      config: status,
    });
  } catch (error) {
    const isSr = error instanceof SportradarError;
    const httpStatus = isSr ? error.status : 502;
    let problem = 'request_failed';
    if (httpStatus === 401 || httpStatus === 403) problem = 'key_rejected';
    else if (httpStatus === 429) problem = 'rate_limited';

    return NextResponse.json(
      {
        ok: false,
        problem,
        detail:
          problem === 'key_rejected'
            ? `Sportradar rejected the key for access level "${status.accessLevel}". If your key is a production key, set SPORTRADAR_ACCESS_LEVEL=production (or vice versa) and redeploy.`
            : error instanceof Error
              ? error.message
              : 'Unknown error.',
        config: status,
      },
      { status: httpStatus }
    );
  }
}
