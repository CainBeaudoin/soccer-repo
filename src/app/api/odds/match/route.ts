import { NextRequest, NextResponse } from 'next/server';
import { getMatchOdds } from '@/lib/odds/client';
import { devig } from '@/lib/odds/implied';
import { SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

export const dynamic = 'force-dynamic';

/**
 * Consensus odds for one event, with the bookmaker margin removed so the
 * market's probabilities are directly comparable to the model's.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
  }

  try {
    const odds = await getMatchOdds(eventId, credsFromRequest(request));

    const markets = odds.markets.map((market) => ({
      name: market.name,
      bookmakerCount: market.bookmakerCount,
      overround: market.overround,
      outcomes: devig(market).map(({ outcome, fairProbability }) => ({
        type: outcome.type,
        label: outcome.label,
        price: outcome.price,
        marketProbability: Math.round(fairProbability * 1000) / 10,
      })),
    }));

    return NextResponse.json({ sportEventId: odds.sportEventId, markets });
  } catch (error) {
    const status = error instanceof SportradarError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unknown error fetching odds.';
    return NextResponse.json({ error: message }, { status });
  }
}
