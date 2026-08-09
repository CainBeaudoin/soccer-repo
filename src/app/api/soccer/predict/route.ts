import { NextRequest, NextResponse } from 'next/server';
import { findStandingForTeam, getFormStandings, getStandings, SportradarError } from '@/lib/soccer/sportradar';
import { predictMatch } from '@/lib/soccer/predict';
import { credsFromRequest } from '@/lib/soccer/request-creds';
import type { CompetitorRef } from '@/lib/soccer/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const homeId = searchParams.get('homeId');
  const awayId = searchParams.get('awayId');
  const homeName = searchParams.get('homeName') ?? 'Home';
  const awayName = searchParams.get('awayName') ?? 'Away';
  const seasonId = searchParams.get('seasonId');

  if (!homeId || !awayId) {
    return NextResponse.json({ error: 'homeId and awayId are required.' }, { status: 400 });
  }
  if (!seasonId) {
    return NextResponse.json(
      { error: 'seasonId is required — this match did not include season info from Sportradar.' },
      { status: 400 }
    );
  }

  try {
    const creds = credsFromRequest(request);
    const [standings, form] = await Promise.all([
      getStandings(seasonId, creds),
      getFormStandings(seasonId, creds),
    ]);
    const homeStanding = findStandingForTeam(standings, homeId);
    const awayStanding = findStandingForTeam(standings, awayId);
    if (homeStanding && form.has(homeId)) homeStanding.form = form.get(homeId);
    if (awayStanding && form.has(awayId)) awayStanding.form = form.get(awayId);

    const home: CompetitorRef = homeStanding ?? { id: homeId, name: homeName, abbreviation: '' };
    const away: CompetitorRef = awayStanding ?? { id: awayId, name: awayName, abbreviation: '' };

    const result = predictMatch(home, away, homeStanding, awayStanding);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof SportradarError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unknown error generating prediction.';
    return NextResponse.json({ error: message }, { status });
  }
}
