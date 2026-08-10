import { NextRequest, NextResponse } from 'next/server';
import { buildEdgeReport } from '@/lib/polymarket/edge';
import { PolymarketError } from '@/lib/polymarket/client';
import { SportradarError } from '@/lib/soccer/sportradar';
import { credsFromRequest } from '@/lib/soccer/request-creds';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Invalid date. Use YYYY-MM-DD.' }, { status: 400 });
  }

  try {
    const report = await buildEdgeReport(date, credsFromRequest(request));
    return NextResponse.json(report);
  } catch (error) {
    const status =
      error instanceof SportradarError || error instanceof PolymarketError ? error.status : 502;
    const message = error instanceof Error ? error.message : 'Unknown error building the report.';
    return NextResponse.json({ error: message }, { status });
  }
}
