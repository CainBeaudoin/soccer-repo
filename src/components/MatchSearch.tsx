'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { credHeaders, type StoredCreds } from '@/lib/soccer/credential-storage';
import type { OddsSportEvent } from '@/lib/odds/types';

interface SearchResponse {
  query: string;
  date: string;
  events: OddsSportEvent[];
  sportsSearched: number;
  sportsTotal: number;
}

interface MarketOutcome {
  type: string;
  label: string;
  price: number | null;
  marketProbability: number;
}

interface OddsResponse {
  sportEventId: string;
  markets: { name: string; bookmakerCount: number; overround: number | null; outcomes: MarketOutcome[] }[];
}

async function fetcher<T>([url, creds]: [string, StoredCreds | null]): Promise<T> {
  const res = await fetch(url, { headers: credHeaders(creds) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

function formatStart(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function MatchSearch({ creds, date }: { creds: StoredCreds | null; date: string }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR<SearchResponse>(
    query.length >= 2 && creds
      ? ([`/api/odds/search?q=${encodeURIComponent(query)}&date=${date}`, creds] as const)
      : null,
    fetcher
  );

  const { data: odds, error: oddsError, isLoading: loadingOdds } = useSWR<OddsResponse>(
    openEventId && creds ? ([`/api/odds/match?eventId=${encodeURIComponent(openEventId)}`, creds] as const) : null,
    fetcher
  );

  const searchError = error instanceof Error ? error.message : null;
  const oddsErrMsg = oddsError instanceof Error ? oddsError.message : null;

  return (
    <div className="bg-[#121a15] border border-white/10 rounded-2xl p-5 mb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input.trim());
          setOpenEventId(null);
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search any sport — team, player, or competition"
          className="flex-1 bg-[#0f1512] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#3fae5f]"
        />
        <button
          type="submit"
          disabled={input.trim().length < 2}
          className="px-5 rounded-xl bg-[#3fae5f] hover:bg-[#56c576] disabled:bg-white/10 disabled:text-white/30 text-black text-sm font-semibold transition-colors"
        >
          Search
        </button>
      </form>

      {isLoading && <p className="text-white/40 text-sm py-6 text-center">Searching across sports…</p>}

      {!isLoading && searchError && (
        <div className="py-6 text-center">
          <p className="text-[#ef4444] text-sm mb-1">Search failed</p>
          <p className="text-white/40 text-xs">{searchError}</p>
        </div>
      )}

      {!isLoading && !searchError && data && (
        <div className="mt-4">
          <p className="text-white/30 text-xs mb-2">
            {data.events.length} result(s) · searched {data.sportsSearched} of {data.sportsTotal} sports
          </p>

          <div className="space-y-2">
            {data.events.map((event) => {
              const open = openEventId === event.id;
              return (
                <div key={event.id} className="rounded-xl bg-[#0f1512] border border-white/5 overflow-hidden">
                  <button
                    onClick={() => setOpenEventId(open ? null : event.id)}
                    className="w-full text-left p-3.5 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/60">
                        {event.sportName}
                      </span>
                      {event.competitionName && (
                        <span className="text-white/30 text-xs truncate">{event.competitionName}</span>
                      )}
                      <span className="text-white/30 text-xs ml-auto whitespace-nowrap">
                        {formatStart(event.startTime)}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium">{event.name}</p>
                    <p className="text-[#3fae5f] text-xs mt-1">{open ? 'Hide odds' : 'Show market odds →'}</p>
                  </button>

                  {open && (
                    <div className="px-3.5 pb-3.5 border-t border-white/5 pt-3">
                      {loadingOdds && <p className="text-white/40 text-xs">Loading consensus odds…</p>}

                      {!loadingOdds && oddsErrMsg && <p className="text-white/40 text-xs">{oddsErrMsg}</p>}

                      {!loadingOdds && !oddsErrMsg && odds && odds.markets.length === 0 && (
                        <p className="text-white/40 text-xs">No markets priced for this event.</p>
                      )}

                      {!loadingOdds &&
                        !oddsErrMsg &&
                        odds?.markets.slice(0, 3).map((market) => (
                          <div key={market.name} className="mb-3 last:mb-0">
                            <div className="flex items-baseline justify-between mb-1.5">
                              <span className="text-white/50 text-[11px] uppercase tracking-wide">
                                {market.name}
                              </span>
                              {market.overround !== null && (
                                <span className="text-white/25 text-[10px]">
                                  {market.bookmakerCount > 0 ? `${market.bookmakerCount} books · ` : ''}
                                  {((market.overround - 1) * 100).toFixed(1)}% margin
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {market.outcomes.map((o) => (
                                <div
                                  key={o.label}
                                  className="bg-[#182019] rounded-lg px-2.5 py-2 border border-white/5"
                                >
                                  <p className="text-white/40 text-[10px] uppercase truncate">{o.label}</p>
                                  <p className="text-white text-sm font-semibold tabular-nums">
                                    {o.price?.toFixed(2) ?? '—'}
                                  </p>
                                  <p className="text-[#3fae5f] text-[10px] tabular-nums">
                                    {o.marketProbability}% implied
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.events.length === 0 && (
            <p className="text-white/40 text-sm py-4 text-center">
              Nothing found for “{data.query}” on this date.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
