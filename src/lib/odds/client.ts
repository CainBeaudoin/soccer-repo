import 'server-only';
import { SportradarError, type SportradarCreds } from '@/lib/soccer/sportradar';
import { overroundOf } from './implied';
import type {
  ConsensusMarket,
  MatchOdds,
  OddsCompetitor,
  OddsOutcome,
  OddsSport,
  OddsSportEvent,
} from './types';

/**
 * Odds Comparison Regular API (v2).
 *
 * NOTE ON PATHS: these follow Sportradar's documented v2 conventions, but
 * unlike the soccer feeds they have not been exercised against the live API
 * from this codebase. If a call 404s, the path below is the thing to check
 * first — they are deliberately collected here rather than scattered, and
 * the base segment is overridable via SPORTRADAR_ODDS_BASE for exactly that
 * reason. /api/odds/health reports what each one returned.
 */
const PATHS = {
  sports: () => `/sports.json`,
  // Schedule of events for one sport on one day.
  sportSchedule: (sportId: string, date: string) =>
    `/sports/${encodeURIComponent(sportId)}/schedules/${date}/schedules.json`,
  // Consensus markets/prices for a single event.
  eventMarkets: (eventId: string) =>
    `/sport_events/${encodeURIComponent(eventId)}/sport_event_markets.json`,
};

function config(creds?: SportradarCreds) {
  const apiKey = (
    creds?.apiKey ??
    process.env.SPORTRADAR_ODDS_API_KEY ??
    process.env.SPORTRADAR_SOCCER_API_KEY
  )?.trim();
  const accessLevel = (creds?.accessLevel || process.env.SPORTRADAR_ACCESS_LEVEL || 'trial').trim();
  const language = (process.env.SPORTRADAR_LANGUAGE || 'en').trim();
  const base = (process.env.SPORTRADAR_ODDS_BASE || 'oddscomparison-rg').trim();
  return {
    apiKey,
    accessLevel,
    baseUrl: `https://api.sportradar.com/${base}/${accessLevel}/v2/${language}`,
  };
}

export function oddsConfigStatus(creds?: SportradarCreds) {
  const { apiKey, accessLevel, baseUrl } = config(creds);
  return { apiKeyPresent: Boolean(apiKey), accessLevel, baseUrl };
}

type CacheEntry = { expires: number; value: unknown };
const cache = new Map<string, CacheEntry>();

function fingerprint(apiKey: string, accessLevel: string): string {
  let h = 0;
  const s = `${accessLevel}:${apiKey}`;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function oddsRequest<T>(path: string, ttlMs: number, creds?: SportradarCreds): Promise<T> {
  const { apiKey, accessLevel, baseUrl } = config(creds);
  if (!apiKey) {
    throw new SportradarError(
      'No Sportradar API key available for the Odds Comparison API. Enter one in the app or set SPORTRADAR_ODDS_API_KEY.',
      500
    );
  }

  const cacheKey = `${fingerprint(apiKey, accessLevel)}|${path}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${baseUrl}${path}${sep}api_key=${encodeURIComponent(apiKey)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new SportradarError('Odds API rate limit exceeded. Try again in a moment.', 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new SportradarError(
        `The Odds Comparison API rejected the key for access level "${accessLevel}". A key valid for the soccer feeds still needs the Odds Comparison product enabled.`,
        res.status
      );
    }
    if (res.status === 404) {
      throw new SportradarError(
        `Odds endpoint not found (${path}). The Odds Comparison path or base segment may differ for your account — see SPORTRADAR_ODDS_BASE.`,
        404
      );
    }
    throw new SportradarError(`Odds request failed with status ${res.status}.`, res.status);
  }

  const data = (await res.json()) as T;
  cache.set(cacheKey, { expires: Date.now() + ttlMs, value: data });
  return data;
}

// Payloads are read defensively: field names vary across odds feeds and
// coverage tiers, so anything unrecognised degrades to null rather than
// throwing and taking the whole search down with it.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSport(raw: any): OddsSport | null {
  if (!raw?.id) return null;
  return { id: String(raw.id), name: typeof raw.name === 'string' ? raw.name : String(raw.id) };
}

export async function getSports(creds?: SportradarCreds): Promise<OddsSport[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await oddsRequest<any>(PATHS.sports(), 24 * 60 * 60_000, creds);
  const list = Array.isArray(raw?.sports) ? raw.sports : [];
  return list.map(normalizeSport).filter((s: OddsSport | null): s is OddsSport => s !== null);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCompetitor(raw: any): OddsCompetitor | null {
  if (!raw?.id) return null;
  const qualifier = raw.qualifier === 'home' || raw.qualifier === 'away' ? raw.qualifier : null;
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name : String(raw.id),
    qualifier,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEvent(raw: any, fallbackSport?: OddsSport): OddsSportEvent | null {
  const event = raw?.sport_event ?? raw;
  if (!event?.id) return null;

  const competitors = (Array.isArray(event.competitors) ? event.competitors : [])
    .map(normalizeCompetitor)
    .filter((c: OddsCompetitor | null): c is OddsCompetitor => c !== null);

  const context = event.sport_event_context;
  const sport = context?.sport ?? event.sport;

  const name =
    typeof event.name === 'string'
      ? event.name
      : competitors.length === 2
        ? `${competitors[0].name} vs ${competitors[1].name}`
        : String(event.id);

  return {
    id: String(event.id),
    name,
    startTime: typeof event.start_time === 'string' ? event.start_time : '',
    sportId: String(sport?.id ?? fallbackSport?.id ?? ''),
    sportName: String(sport?.name ?? fallbackSport?.name ?? 'Unknown'),
    competitionName:
      typeof context?.competition?.name === 'string'
        ? context.competition.name
        : typeof context?.tournament?.name === 'string'
          ? context.tournament.name
          : null,
    competitors,
  };
}

export async function getSportSchedule(
  sport: OddsSport,
  date: string,
  creds?: SportradarCreds
): Promise<OddsSportEvent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await oddsRequest<any>(PATHS.sportSchedule(sport.id, date), 5 * 60_000, creds);
  const list = Array.isArray(raw?.schedules)
    ? raw.schedules
    : Array.isArray(raw?.sport_events)
      ? raw.sport_events
      : [];
  return list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => normalizeEvent(item, sport))
    .filter((e: OddsSportEvent | null): e is OddsSportEvent => e !== null);
}

/** Maps a raw outcome label onto home/draw/away when it is recognisable. */
function classifyOutcome(label: string): string {
  const l = label.trim().toLowerCase();
  if (l === '1' || l === 'home' || l === 'home team') return 'home';
  if (l === 'x' || l === 'draw' || l === 'tie') return 'draw';
  if (l === '2' || l === 'away' || l === 'away team') return 'away';
  return label;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOutcome(raw: any): OddsOutcome | null {
  if (!raw) return null;
  const label = String(raw.type ?? raw.name ?? raw.outcome ?? '').trim();
  if (!label) return null;

  const priceRaw = raw.odds ?? raw.price ?? raw.odds_decimal ?? raw.decimal;
  const price = typeof priceRaw === 'number' ? priceRaw : Number.parseFloat(String(priceRaw ?? ''));

  return {
    type: classifyOutcome(label),
    label,
    price: Number.isFinite(price) && price > 1 ? price : null,
    rawProbability: null,
  };
}

export async function getMatchOdds(
  sportEventId: string,
  creds?: SportradarCreds
): Promise<MatchOdds> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await oddsRequest<any>(PATHS.eventMarkets(sportEventId), 60_000, creds);

  const rawMarkets = Array.isArray(raw?.markets)
    ? raw.markets
    : Array.isArray(raw?.sport_event_markets)
      ? raw.sport_event_markets
      : [];

  const markets: ConsensusMarket[] = [];
  for (const m of rawMarkets) {
    const name = String(m?.name ?? m?.id ?? 'Market');
    // Books may be nested per-bookmaker; consensus prices sit at the market level.
    const rawOutcomes = Array.isArray(m?.outcomes)
      ? m.outcomes
      : Array.isArray(m?.books?.[0]?.outcomes)
        ? m.books[0].outcomes
        : [];

    const outcomes = rawOutcomes
      .map(normalizeOutcome)
      .filter((o: OddsOutcome | null): o is OddsOutcome => o !== null);
    if (outcomes.length === 0) continue;

    const market: ConsensusMarket = {
      name,
      bookmakerCount: Array.isArray(m?.books) ? m.books.length : 0,
      outcomes,
      overround: null,
    };
    market.overround = overroundOf(market);
    markets.push(market);
  }

  return { sportEventId, markets };
}

/**
 * Cross-sport search. The odds feed is organised per sport per day, so a
 * query means fanning out across sports — sequentially, with a cap, to
 * respect the trial rate limit — and matching competitor names locally.
 */
export async function searchEvents(
  query: string,
  date: string,
  creds?: SportradarCreds,
  maxSports = 6
): Promise<{ events: OddsSportEvent[]; sportsSearched: number; sportsTotal: number }> {
  const needle = query.trim().toLowerCase();
  const sports = await getSports(creds);
  const results: OddsSportEvent[] = [];
  let sportsSearched = 0;

  for (const sport of sports) {
    if (sportsSearched >= maxSports) break;
    if (sportsSearched > 0) await new Promise((r) => setTimeout(r, 1100));

    try {
      const events = await getSportSchedule(sport, date, creds);
      for (const event of events) {
        const hit =
          event.name.toLowerCase().includes(needle) ||
          event.competitors.some((c) => c.name.toLowerCase().includes(needle)) ||
          (event.competitionName ?? '').toLowerCase().includes(needle);
        if (hit) results.push(event);
      }
      sportsSearched++;
    } catch {
      // A sport with no coverage on this key must not fail the whole search.
      sportsSearched++;
    }
  }

  results.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  return { events: results, sportsSearched, sportsTotal: sports.length };
}
