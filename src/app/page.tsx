'use client';

import { useState, useSyncExternalStore } from 'react';
import useSWR from 'swr';
import Button from '@/components/ui/Button';
import ApiKeyPanel from '@/components/ApiKeyPanel';
import OddsBar from '@/components/OddsBar';
import {
  clearCreds,
  credHeaders,
  getCredsServerSnapshot,
  getCredsSnapshot,
  saveCreds,
  subscribeCreds,
  type StoredCreds,
} from '@/lib/soccer/credential-storage';
import type { ScheduleMatch } from '@/lib/soccer/types';
import type { MatchOutcome, PredictionResult } from '@/lib/soccer/predict';
import type { BoardEntry, BoardResponse } from '@/lib/soccer/board';

type SortMode = 'edge' | 'time';

/** SWR keys are [url, creds] so a credential change refetches automatically. */
async function fetcher<T>([url, creds]: [string, StoredCreds | null]): Promise<T> {
  const res = await fetch(url, { headers: credHeaders(creds) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusMeta(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s.includes('live') || s.includes('half') || s === '1st_half' || s === '2nd_half') {
    return { label: 'LIVE', className: 'bg-[#ef4444]/20 text-[#ef4444]' };
  }
  if (s.includes('closed') || s.includes('ended') || s === 'final') {
    return { label: 'FT', className: 'bg-white/10 text-white/50' };
  }
  if (s.includes('postpon') || s.includes('cancel') || s.includes('interrupt') || s.includes('abandon')) {
    return { label: status.replace(/_/g, ' ').toUpperCase(), className: 'bg-white/10 text-white/40' };
  }
  return { label: 'UPCOMING', className: 'bg-[#3fae5f]/20 text-[#3fae5f]' };
}

function formatKickoff(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function predictionUrl(match: ScheduleMatch): string | null {
  if (!match.seasonId) return null;
  const params = new URLSearchParams({
    homeId: match.home.id,
    awayId: match.away.id,
    homeName: match.home.name,
    awayName: match.away.name,
    seasonId: match.seasonId,
  });
  return `/api/soccer/predict?${params.toString()}`;
}

function outcomeLabel(outcome: MatchOutcome, match: ScheduleMatch): string {
  if (outcome === 'home') return match.home.name;
  if (outcome === 'away') return match.away.name;
  return 'Draw';
}

/**
 * How lopsided a match looks: the favourite's probability minus the next
 * most likely outcome. A 70/20/10 match separates further than 45/40/15
 * even though both have a clear favourite, so this ranks by margin rather
 * than by the top number alone.
 */
function edgeOf(prediction: PredictionResult | null): number {
  if (!prediction) return -1;
  const sorted = [prediction.probabilities.home, prediction.probabilities.draw, prediction.probabilities.away].sort(
    (a, b) => b - a
  );
  return sorted[0] - sorted[1];
}

function sortEntries(entries: BoardEntry[], mode: SortMode): BoardEntry[] {
  const copy = [...entries];
  if (mode === 'time') {
    copy.sort((a, b) => (a.match.scheduled || '').localeCompare(b.match.scheduled || ''));
    return copy;
  }
  // Unpredicted matches sink to the bottom rather than mixing into the ranking.
  copy.sort((a, b) => edgeOf(b.prediction) - edgeOf(a.prediction));
  return copy;
}

export default function Home() {
  const [date, setDate] = useState(todayIso());
  const [selectedMatch, setSelectedMatch] = useState<ScheduleMatch | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('edge');
  // sessionStorage is an external store: useSyncExternalStore reads it
  // without a setState-in-effect cascade and keeps the server render
  // ("not connected") consistent with the first client render.
  const creds = useSyncExternalStore(subscribeCreds, getCredsSnapshot, getCredsServerSnapshot);

  const {
    data: board,
    error: matchesErrorObj,
    isLoading: loadingMatches,
    mutate: refreshMatches,
  } = useSWR<BoardResponse>(creds ? ([`/api/soccer/board?date=${date}`, creds] as const) : null, fetcher);
  const entries = board ? sortEntries(board.entries, sortMode) : null;
  const matchesError = matchesErrorObj instanceof Error ? matchesErrorObj.message : null;

  const predUrl = selectedMatch ? predictionUrl(selectedMatch) : null;
  const {
    data: prediction,
    error: predictionErrorObj,
    isLoading: loadingPrediction,
    mutate: retryPrediction,
  } = useSWR<PredictionResult>(predUrl && creds ? ([predUrl, creds] as const) : null, fetcher);
  const predictionError = predictionErrorObj instanceof Error ? predictionErrorObj.message : null;

  function handleDisconnect() {
    clearCreds();
    setSelectedMatch(null);
  }

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Soccer Predictor</h1>
          <p className="text-white/50 text-sm">
            Pick a match and get a data-driven outcome estimate — home win, draw, or away win.
          </p>
          <p className="text-white/30 text-xs mt-1">Informational only — not betting advice.</p>
        </header>

        {!creds && <ApiKeyPanel onSaved={(apiKey, accessLevel) => saveCreds({ apiKey, accessLevel })} />}

        {creds && (
          <div className="flex items-center justify-between gap-3 mb-4 text-xs">
            <span className="text-[#3fae5f]">
              ● Connected · {creds.accessLevel}
            </span>
            <button
              onClick={handleDisconnect}
              className="text-white/40 hover:text-white underline underline-offset-2"
            >
              Use a different key
            </button>
          </div>
        )}

        {creds && !selectedMatch && (
          <div className="bg-[#121a15] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label htmlFor="match-date" className="text-white/50 text-sm">
                  Date
                </label>
                <input
                  id="match-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-[#182019] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-[#182019] border border-white/10 rounded-lg p-0.5">
                  <button
                    onClick={() => setSortMode('edge')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      sortMode === 'edge' ? 'bg-[#3fae5f] text-black' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Biggest gap
                  </button>
                  <button
                    onClick={() => setSortMode('time')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      sortMode === 'time' ? 'bg-[#3fae5f] text-black' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Kick-off
                  </button>
                </div>
                <Button variant="secondary" size="sm" onClick={() => refreshMatches()} disabled={loadingMatches}>
                  Refresh
                </Button>
              </div>
            </div>

            {loadingMatches && (
              <p className="text-white/40 text-sm py-8 text-center">
                Loading matches and running predictions…
              </p>
            )}

            {!loadingMatches && matchesError && (
              <div className="text-center py-8">
                <p className="text-[#ef4444] text-sm mb-1">Couldn&apos;t load matches</p>
                <p className="text-white/40 text-xs">{matchesError}</p>
              </div>
            )}

            {!loadingMatches && !matchesError && entries && entries.length === 0 && (
              <p className="text-white/40 text-sm py-8 text-center">No matches scheduled for this date.</p>
            )}

            {!loadingMatches && !matchesError && entries && entries.length > 0 && (
              <div className="space-y-2">
                {entries.map(({ match, prediction, unavailableReason }) => {
                  const meta = statusMeta(match.status);
                  const edge = edgeOf(prediction);
                  return (
                    <button
                      key={match.id}
                      onClick={() => prediction && setSelectedMatch(match)}
                      disabled={!prediction}
                      className="w-full p-4 rounded-xl bg-[#0f1512] border border-white/5 hover:border-[#3fae5f]/40 transition-colors text-left disabled:cursor-not-allowed disabled:hover:border-white/5 disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.className}`}>
                          {meta.label}
                        </span>
                        <span className="text-white/30 text-xs truncate">{match.competitionName}</span>
                        <span className="text-white/30 text-xs ml-auto whitespace-nowrap">
                          {formatKickoff(match.scheduled)}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-3 mb-2.5">
                        <p className="text-white font-medium text-sm truncate">
                          {match.home.name}
                          {typeof match.homeScore === 'number' ? ` ${match.homeScore}` : ''} vs {match.away.name}
                          {typeof match.awayScore === 'number' ? ` ${match.awayScore}` : ''}
                        </p>
                        {prediction && (
                          <span className="text-[10px] text-white/30 whitespace-nowrap uppercase tracking-wide">
                            +{edge} gap
                          </span>
                        )}
                      </div>

                      {prediction ? (
                        <OddsBar
                          prediction={prediction}
                          homeName={match.home.abbreviation || match.home.name}
                          awayName={match.away.abbreviation || match.away.name}
                        />
                      ) : (
                        <p className="text-white/25 text-xs">{unavailableReason}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {!loadingMatches && !matchesError && board && board.seasonsSkipped > 0 && (
              <p className="text-white/25 text-xs mt-3 text-center">
                {board.seasonsSkipped} competition(s) not priced — standings unavailable or the per-request
                limit was reached. Sort by kick-off to see them in schedule order.
              </p>
            )}
          </div>
        )}

        {creds && selectedMatch && (
          <div className="bg-[#121a15] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-white/40 text-xs uppercase tracking-wide mb-1">{selectedMatch.competitionName}</p>
                <h2 className="text-xl font-bold text-white">
                  {selectedMatch.home.name} vs {selectedMatch.away.name}
                </h2>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setSelectedMatch(null)}>
                New Prediction
              </Button>
            </div>

            {loadingPrediction && <p className="text-white/40 text-sm py-10 text-center">Crunching the numbers…</p>}

            {!loadingPrediction && predictionError && (
              <div className="text-center py-10">
                <p className="text-[#ef4444] text-sm mb-1">Couldn&apos;t generate a prediction</p>
                <p className="text-white/40 text-xs mb-4">{predictionError}</p>
                <Button variant="secondary" size="sm" onClick={() => retryPrediction()}>
                  Try Again
                </Button>
              </div>
            )}

            {!loadingPrediction && prediction && (
              <div className="space-y-6">
                <div className="text-center bg-gradient-to-b from-[#3fae5f]/10 to-transparent rounded-2xl border border-[#3fae5f]/30 p-6">
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-2">Predicted Outcome</p>
                  <p className="text-3xl font-bold text-[#3fae5f] mb-1">
                    {prediction.outcome === 'draw' ? 'Draw' : outcomeLabel(prediction.outcome, selectedMatch)}
                  </p>
                  <p className="text-white/40 text-sm">{prediction.confidencePct}% confidence</p>
                  {!prediction.dataComplete && (
                    <p className="text-white/30 text-xs mt-2">Limited season data was available for this matchup.</p>
                  )}
                </div>

                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-3">Win Probability</p>
                  <div className="space-y-2">
                    {(
                      [
                        ['home', selectedMatch.home.name, prediction.probabilities.home],
                        ['draw', 'Draw', prediction.probabilities.draw],
                        ['away', selectedMatch.away.name, prediction.probabilities.away],
                      ] as [MatchOutcome, string, number][]
                    ).map(([key, label, pct]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={prediction.outcome === key ? 'text-[#3fae5f] font-semibold' : 'text-white/60'}>
                            {label}
                          </span>
                          <span className={`num ${prediction.outcome === key ? 'text-[#3fae5f] font-semibold' : 'text-white/40'}`}>
                            {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${prediction.outcome === key ? 'bg-[#3fae5f]' : 'bg-white/20'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-white/50 text-xs uppercase tracking-wide mb-3">The Thesis</p>
                  <ul className="space-y-2">
                    {prediction.thesis.map((line, i) => (
                      <li key={i} className="flex gap-2 text-sm text-white/70">
                        <span className="text-[#3fae5f] flex-shrink-0">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {prediction.comparison.length > 0 && (
                  <div>
                    <p className="text-white/50 text-xs uppercase tracking-wide mb-3">Stat Comparison</p>
                    <div className="bg-[#0f1512] rounded-xl border border-white/5 overflow-hidden">
                      <div className="grid grid-cols-3 gap-2 px-4 py-2 text-[10px] text-white/30 uppercase tracking-wide border-b border-white/5">
                        <div>{selectedMatch.home.abbreviation || 'Home'}</div>
                        <div className="text-center">Stat</div>
                        <div className="text-right">{selectedMatch.away.abbreviation || 'Away'}</div>
                      </div>
                      {prediction.comparison.map((row) => (
                        <div
                          key={row.label}
                          className="grid grid-cols-3 gap-2 px-4 py-2.5 text-sm border-b border-white/5 last:border-0"
                        >
                          <div className={row.edge === 'home' ? 'text-[#3fae5f] font-medium' : 'text-white/70'}>
                            {row.home}
                          </div>
                          <div className="text-center text-white/40 text-xs">{row.label}</div>
                          <div className={`text-right ${row.edge === 'away' ? 'text-[#3fae5f] font-medium' : 'text-white/70'}`}>
                            {row.away}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
