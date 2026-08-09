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
 * Odds Comparison Regular API.
 *
 * The Odds Comparison family is documented under v1 (see the developer
 * portal's /odds/v1/ reference), which is a different version line from the
 * v4 soccer feeds. Sportradar answers a path outside an account's
 * entitlement with 403 rather than 404, so a wrong version reads as
 * "key rejected" instead of "not found" — hence the version, like the base
 * segment, is overridable without a code change.
 */
const PATHS = {
  // Bookmaker panel. Lightest authenticated call, so it doubles as the probe.
  books: () => `/books.json`,
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
  const version = (process.env.SPORTRADAR_ODDS_VERSION || 'v1').trim();
  return {
    apiKey,
    accessLevel,
    version,
    baseUrl: `https://api.sportradar.com/${base}/${accessLevel}/${version}/${language}`,
  };
}

export function oddsConfigStatus(creds?: SportradarCreds) {
  const { apiKey, accessLevel, version, baseUrl } = config(creds);
  return { apiKeyPresent: Boolean(apiKey), accessLevel, version, baseUrl };
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
  const { apiKey, accessLevel, version, baseUrl } = config(creds);
  const base = (process.env.SPORTRADAR_ODDS_BASE || 'oddscomparison-rg').trim();
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
      // Sportradar answers an out-of-entitlement path with 403, so this is
      // not necessarily a bad key — the URL shape is just as likely.
      throw new SportradarError(
        `Odds Comparison returned ${res.status} for ${baseUrl}${path}. Three things produce this: ` +
          `(1) the Odds Comparison product is not enabled on the key — it is a separate entitlement from the soccer feeds; ` +
          `(2) the access level is wrong — currently "${accessLevel}", try the other; ` +
          `(3) the URL line is wrong — currently base "${base}" version "${version}", override with SPORTRADAR_ODDS_BASE / SPORTRADAR_ODDS_VERSION.`,
        res.status
      );
    }
    if (res.status === 404) {
      throw new SportradarError(
        `Odds endpoint not found: ${baseUrl}${path}. Check SPORTRADAR_ODDS_BASE (currently "${base}") and SPORTRADAR_ODDS_VERSION (currently "${version}").`,
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

/** Bookmaker panel — the lightest authenticated call, used to probe access. */
export async function getBooks(creds?: SportradarCreds): Promise<{ id: string; name: string }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await oddsRequest<any>(PATHS.books(), 60 * 60_000, creds);
  const list = Array.isArray(raw?.books) ? raw.books : [];
  return list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => (b?.id ? { id: String(b.id), name: String(b.name ?? b.id) } : null))
    .filter((b: { id: string; name: string } | null): b is { id: string; name: string } => b !== null);
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

export interface VariantProbe {
  base: string;
  version: string;
  accessLevel: string;
  url: string;
  status: number | 'error';
  ok: boolean;
  note?: string;
}

/**
 * Tries the plausible Odds Comparison URL lines and reports which one the
 * key actually opens. Sportradar answers both a bad entitlement and a wrong
 * path with 403, so the product/base/version cannot be told apart from a
 * single failed call — probing turns that ambiguity into a definite answer
 * without redeploying to test each guess by hand.
 *
 * Runs sequentially with a pause: it is a diagnostic, and tripping the rate
 * limit mid-probe would produce exactly the ambiguity it exists to remove.
 */
export async function probeVariants(creds?: SportradarCreds): Promise<VariantProbe[]> {
  const { apiKey } = config(creds);
  if (!apiKey) throw new SportradarError('No API key supplied.', 400);

  const language = (process.env.SPORTRADAR_LANGUAGE || 'en').trim();
  const bases = ['oddscomparison-rg', 'oddscomparison'];
  const versions = ['v1', 'v2'];
  const levels = [
    (creds?.accessLevel || process.env.SPORTRADAR_ACCESS_LEVEL || 'trial').trim(),
    creds?.accessLevel === 'production' ? 'trial' : 'production',
  ];

  const results: VariantProbe[] = [];
  let first = true;

  for (const accessLevel of [...new Set(levels)]) {
    for (const base of bases) {
      for (const version of versions) {
        if (!first) await new Promise((r) => setTimeout(r, 1100));
        first = false;

        const url = `https://api.sportradar.com/${base}/${accessLevel}/${version}/${language}/books.json`;
        try {
          const res = await fetch(`${url}?api_key=${encodeURIComponent(apiKey)}`, { cache: 'no-store' });
          results.push({
            base,
            version,
            accessLevel,
            url,
            status: res.status,
            ok: res.ok,
            note: res.ok
              ? 'Works — set SPORTRADAR_ODDS_BASE / SPORTRADAR_ODDS_VERSION to these values.'
              : res.status === 403
                ? 'Rejected: product not entitled, or this URL line is wrong.'
                : res.status === 404
                  ? 'No such path on this account.'
                  : undefined,
          });
          // A working line makes the remaining combinations moot.
          if (res.ok) return results;
        } catch (error) {
          results.push({
            base,
            version,
            accessLevel,
            url,
            status: 'error',
            ok: false,
            note: error instanceof Error ? error.message : 'Request failed.',
          });
        }
      }
    }
  }

  return results;
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
