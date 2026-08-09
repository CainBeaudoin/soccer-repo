import { NextRequest, NextResponse } from 'next/server';
import { configStatus, getCompetitionInfo, getDailySchedule, SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint: reports whether a key was available and what
 * Sportradar answered, separating a missing key from a rejected one, a
 * wrong access level, and rate limiting. Accepts a caller-supplied key so
 * it can validate one before the app stores it. Never returns the key —
 * only whether one is present, its length, and where it came from.
 */
export async function GET(request: NextRequest) {
  const creds = credsFromRequest(request);
  const status = configStatus(creds);

  if (!status.apiKeyPresent) {
    return NextResponse.json(
      {
        ok: false,
        problem: 'missing_api_key',
        detail:
          'No API key was supplied with the request and none is set on the server. Enter a key in the app, or set SPORTRADAR_SOCCER_API_KEY in the deployment environment and redeploy.',
        config: status,
      },
      { status: 400 }
    );
  }

  try {
    const competition = await getCompetitionInfo(undefined, creds);
    let scheduleNote: string;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const schedule = await getDailySchedule(today, creds);
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
    const httpStatus = error instanceof SportradarError ? error.status : 502;
    let problem = 'request_failed';
    if (httpStatus === 401 || httpStatus === 403) problem = 'key_rejected';
    else if (httpStatus === 429) problem = 'rate_limited';

    return NextResponse.json(
      {
        ok: false,
        problem,
        detail: error instanceof Error ? error.message : 'Unknown error.',
        config: status,
      },
      { status: httpStatus }
    );
  }
}
