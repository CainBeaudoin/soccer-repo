import { NextRequest, NextResponse } from 'next/server';
import { getSports, oddsConfigStatus } from '@/lib/odds/client';
import { SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

export const dynamic = 'force-dynamic';

/**
 * Confirms the key reaches the Odds Comparison product and that the
 * configured base segment resolves. Reports the sports the key can see,
 * which is also what cross-sport search fans out over.
 */
export async function GET(request: NextRequest) {
  const creds = credsFromRequest(request);
  const status = oddsConfigStatus(creds);

  if (!status.apiKeyPresent) {
    return NextResponse.json(
      { ok: false, problem: 'missing_api_key', detail: 'No API key supplied.', config: status },
      { status: 400 }
    );
  }

  try {
    const sports = await getSports(creds);
    return NextResponse.json({
      ok: true,
      detail: `Odds Comparison reachable. ${sports.length} sport(s) available.`,
      sports: sports.map((s) => s.name),
      config: status,
    });
  } catch (error) {
    const httpStatus = error instanceof SportradarError ? error.status : 502;
    let problem = 'request_failed';
    if (httpStatus === 401 || httpStatus === 403) problem = 'key_or_product_denied';
    else if (httpStatus === 404) problem = 'wrong_base_or_path';

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
