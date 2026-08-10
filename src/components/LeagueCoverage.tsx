'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { credHeaders, type StoredCreds } from '@/lib/soccer/credential-storage';
import type { LeagueCoverage as Row } from '@/lib/polymarket/league-matching';

interface CoverageResponse {
  counts: {
    total: number;
    covered: number;
    ambiguous: number;
    notFound: number;
    competitionsAvailable: number;
  };
  rows: Row[];
  duplicateLabels: { label: string; entries: { name: string; markets: number | null }[] }[];
}

async function fetcher<T>([url, creds]: [string, StoredCreds | null]): Promise<T> {
  const res = await fetch(url, { headers: credHeaders(creds) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const STATUS: Record<string, { label: string; className: string }> = {
  covered: { label: 'COVERED', className: 'bg-[#3fae5f]/20 text-[#3fae5f]' },
  ambiguous: { label: 'AMBIGUOUS', className: 'bg-[#d4a437]/20 text-[#d4a437]' },
  not_found: { label: 'NO DATA', className: 'bg-white/10 text-white/40' },
};

export default function LeagueCoverage({ creds }: { creds: StoredCreds | null }) {
  const [filter, setFilter] = useState<'all' | 'covered' | 'ambiguous' | 'not_found'>('all');
  const [open, setOpen] = useState(false);

  const { data, error, isLoading } = useSWR<CoverageResponse>(
    creds && open ? (['/api/leagues/coverage', creds] as const) : null,
    fetcher
  );
  const errMsg = error instanceof Error ? error.message : null;

  const rows = (data?.rows ?? []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="bg-[#121a15] border border-white/10 rounded-2xl p-5 mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-white font-bold text-lg">Polymarket league coverage</h2>
          <p className="text-white/40 text-xs mt-0.5">
            Which of Polymarket&apos;s soccer leagues this key can price.
          </p>
        </div>
        <span className="text-white/40 text-sm">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4">
          {isLoading && (
            <p className="text-white/40 text-sm py-6 text-center">Loading competition list…</p>
          )}

          {!isLoading && errMsg && (
            <div className="py-6 text-center">
              <p className="text-[#ef4444] text-sm mb-1">Couldn&apos;t load coverage</p>
              <p className="text-white/40 text-xs">{errMsg}</p>
            </div>
          )}

          {!isLoading && !errMsg && data && (
            <>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {(
                  [
                    ['all', data.counts.total, 'Leagues'],
                    ['covered', data.counts.covered, 'Covered'],
                    ['ambiguous', data.counts.ambiguous, 'Ambiguous'],
                    ['not_found', data.counts.notFound, 'No data'],
                  ] as const
                ).map(([key, value, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`rounded-xl px-3 py-2.5 border text-left transition-colors ${
                      filter === key
                        ? 'bg-[#3fae5f]/15 border-[#3fae5f]/50'
                        : 'bg-[#0f1512] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <p className="text-white font-bold text-lg tabular-nums">{value}</p>
                    <p className="text-white/40 text-[10px] uppercase tracking-wide">{label}</p>
                  </button>
                ))}
              </div>

              <p className="text-white/25 text-xs mb-3">
                Matched against {data.counts.competitionsAvailable} competitions visible to this key.
              </p>

              <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
                {rows.map((row) => {
                  const meta = STATUS[row.status] ?? STATUS.not_found;
                  return (
                    <div
                      key={`${row.polymarketName}-${row.markets}`}
                      className="rounded-lg bg-[#0f1512] border border-white/5 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-white text-sm truncate">{row.polymarketName}</span>
                        {row.inferred && (
                          <span
                            className="text-[#d4a437]/70 text-[10px] flex-shrink-0"
                            title="Expanded from a truncated label — verify"
                          >
                            inferred
                          </span>
                        )}
                        {row.markets !== null && (
                          <span className="text-white/30 text-xs ml-auto tabular-nums flex-shrink-0">
                            {row.markets}
                          </span>
                        )}
                      </div>

                      {row.candidates.length > 0 && (
                        <p className="text-white/35 text-[11px] mt-1 pl-1">
                          {row.status === 'ambiguous' ? 'Could be: ' : '→ '}
                          {row.candidates
                            .map((c) => `${c.name}${c.category ? ` (${c.category})` : ''}`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {data.duplicateLabels.length > 0 && (
                <details className="mt-4">
                  <summary className="text-[#d4a437]/80 text-xs cursor-pointer">
                    {data.duplicateLabels.length} truncated label(s) cover several leagues — confirm these
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {data.duplicateLabels.map((d) => (
                      <li key={d.label} className="text-white/40 text-xs">
                        <span className="text-white/60">{d.label}</span> →{' '}
                        {d.entries.map((e) => `${e.name} (${e.markets ?? '—'})`).join(', ')}
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
