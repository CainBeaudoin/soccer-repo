'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { credHeaders, type StoredCreds } from '@/lib/soccer/credential-storage';
import type { EdgeReport } from '@/lib/polymarket/edge';

async function fetcher<T>([url, creds]: [string, StoredCreds | null]): Promise<T> {
  const res = await fetch(url, { headers: credHeaders(creds) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-[#3fae5f]/20 text-[#3fae5f]',
  medium: 'bg-[#d4a437]/20 text-[#d4a437]',
  low: 'bg-white/10 text-white/40',
};

export default function EdgeBoard({ creds, date }: { creds: StoredCreds | null; date: string }) {
  // Opt-in rather than automatic: this report re-reads the schedule and every
  // league table, so firing it on page load alongside the board doubled the
  // API traffic for a panel the viewer had not asked for.
  const [open, setOpen] = useState(false);

  const { data, error, isLoading } = useSWR<EdgeReport>(
    creds && open ? ([`/api/edge?date=${date}`, creds] as const) : null,
    fetcher
  );
  const errMsg = error instanceof Error ? error.message : null;

  return (
    <div className="bg-[#121a15] border border-white/10 rounded-2xl p-5 mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="text-white font-bold text-lg">Polymarket cross-reference</h2>
          <p className="text-white/40 text-xs mt-0.5">
            Model probabilities beside Polymarket&apos;s, sorted by where they disagree most.
          </p>
        </div>
        <span className="text-white/40 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4">

      {isLoading && (
        <p className="text-white/40 text-sm py-8 text-center">
          Matching Polymarket games against the schedule…
        </p>
      )}

      {!isLoading && errMsg && (
        <div className="py-8 text-center">
          <p className="text-[#ef4444] text-sm mb-1">Couldn&apos;t build the cross-reference</p>
          <p className="text-white/40 text-xs">{errMsg}</p>
        </div>
      )}

      {!isLoading && !errMsg && data && (
        <>
          <p className="text-white/30 text-xs mb-3">
            {data.counts.paired} paired · {data.counts.polymarketGames} on Polymarket ·{' '}
            {data.counts.scheduleMatches} in the schedule
          </p>

          {data.rows.length === 0 && (
            <p className="text-white/40 text-sm py-6 text-center">
              No Polymarket games matched this date&apos;s fixtures.
            </p>
          )}

          <div className="space-y-2">
            {data.rows.map((row) => (
              <div key={row.polymarket.id} className="rounded-xl bg-[#0f1512] border border-white/5 p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      CONFIDENCE_STYLE[row.confidence] ?? CONFIDENCE_STYLE.low
                    }`}
                  >
                    {row.confidence.toUpperCase()} MATCH
                  </span>
                  <span className="text-white/30 text-xs truncate">{row.fixture.competition}</span>
                  {row.biggestDivergence !== null && (
                    <span className="ml-auto text-xs font-semibold text-[#3fae5f] tabular-nums">
                      {row.biggestDivergence.toFixed(1)} pt gap
                    </span>
                  )}
                </div>

                <p className="text-white font-medium text-sm">
                  {row.fixture.home} vs {row.fixture.away}
                </p>
                {row.polymarket.title !== `${row.fixture.home} vs ${row.fixture.away}` && (
                  <p className="text-white/25 text-[11px] mb-2">Polymarket: {row.polymarket.title}</p>
                )}

                <div className="mt-3 space-y-1.5">
                  <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wide text-white/30">
                    <span className="col-span-2">Outcome</span>
                    <span className="text-right">Model</span>
                    <span className="text-right">Polymarket</span>
                  </div>
                  {row.outcomes.map((o) => (
                    <div key={o.label} className="grid grid-cols-4 gap-2 text-sm items-baseline">
                      <span className="col-span-2 text-white/70 truncate">{o.label}</span>
                      <span className="text-right text-white tabular-nums">
                        {o.model !== null ? `${o.model}%` : '—'}
                      </span>
                      <span className="text-right tabular-nums">
                        <span className="text-white/70">{o.market !== null ? `${o.market}%` : '—'}</span>
                        {o.difference !== null && (
                          <span
                            className={`ml-1.5 text-[11px] ${
                              o.difference > 0 ? 'text-[#3fae5f]' : 'text-white/30'
                            }`}
                          >
                            {o.difference > 0 ? '+' : ''}
                            {o.difference}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-white/5">
                  <a
                    href={row.polymarket.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#3fae5f] text-xs hover:underline"
                  >
                    Open on Polymarket ↗
                  </a>
                  <span className="text-white/20 text-[10px] ml-auto">
                    match {row.matchScore}
                    {row.minutesApart !== null ? ` · ${Math.round(row.minutesApart)}m apart` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {data.unmatchedPolymarket.length > 0 && (
            <details className="mt-4">
              <summary className="text-white/40 text-xs cursor-pointer hover:text-white/60">
                {data.unmatchedPolymarket.length} Polymarket game(s) with no fixture matched
              </summary>
              <ul className="mt-2 space-y-1">
                {data.unmatchedPolymarket.map((g) => (
                  <li key={g.id} className="text-white/30 text-xs">
                    {g.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
