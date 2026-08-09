import { NextRequest, NextResponse } from 'next/server';
import { searchEvents } from '@/lib/odds/client';
import { SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (query.length < 2) {
    return NextResponse.json({ error: 'Enter at least 2 characters to search.' }, { status: 400 });
  }
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date. Use YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const result = await searchEvents(query, date, credsFromRequest(request));
    return NextResponse.json({ query, date, ...result });
  } catch (error) {
    const status = error instanceof SportradarError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unknown error searching events.';
    return NextResponse.json({ error: message }, { status });
  }
}
