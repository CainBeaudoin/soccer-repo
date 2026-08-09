import { NextRequest, NextResponse } from 'next/server';
import { getBoard } from '@/lib/soccer/board';
import { SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';

/** Schedule plus a prediction for every match, so the list needs no per-match calls. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date. Use YYYY-MM-DD.' }, { status: 400 });
  }

  const preferred = (searchParams.get('competitions') ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  try {
    const board = await getBoard(date, credsFromRequest(request), preferred);
    return NextResponse.json(board);
  } catch (error) {
    const status = error instanceof SportradarError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unknown error building the board.';
    return NextResponse.json({ error: message }, { status });
  }
}
