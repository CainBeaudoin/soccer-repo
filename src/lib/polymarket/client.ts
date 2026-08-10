import 'server-only';

/**
 * Polymarket Gamma API (public, no key required).
 *
 * NOTE: like the Odds Comparison client, these paths follow the documented
 * public API but have not been exercised against the live host from this
 * codebase. GET /api/edge/health reports what the call actually returned.
 */
const GAMMA_BASE = (process.env.POLYMARKET_GAMMA_BASE || 'https://gamma-api.polymarket.com').trim();

export class PolymarketError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'PolymarketError';
    this.status = status;
  }
}

export interface PolymarketOutcome {
  label: string;
  /** Share price in [0,1]; on a prediction market this is the probability. */
  price: number | null;
}

export interface PolymarketGame {
  id: string;
  slug: string;
  title: string;
  startTime?: string;
  /** Derived from the title where the API does not name the sides directly. */
  home: string;
  away: string;
  outcomes: PolymarketOutcome[];
  volume: number | null;
  liquidity: number | null;
  url: string;
}

type CacheEntry = { expires: number; value: unknown };
const cache = new Map<string, CacheEntry>();

async function gammaRequest<T>(path: string, ttlMs = 60_000): Promise<T> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  let res: Response;
  try {
    res = await fetch(`${GAMMA_BASE}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new PolymarketError(
      `Could not reach Polymarket (${GAMMA_BASE}): ${error instanceof Error ? error.message : 'network error'}`,
      502
    );
  }

  if (!res.ok) {
    throw new PolymarketError(`Polymarket request failed with status ${res.status}.`, res.status);
  }

  const data = (await res.json()) as T;
  cache.set(path, { expires: Date.now() + ttlMs, value: data });
  return data;
}

/**
 * Gamma encodes several array fields as JSON strings rather than arrays,
 * so both shapes have to be accepted.
 */
function parseMaybeJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Sports events are titled "Home vs Away" (or "Home vs. Away"), which is
 * the only place the two sides appear as separate strings.
 */
function splitTitle(title: string): { home: string; away: string } | null {
  const match = title.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
  if (!match) return null;
  return { home: match[1].trim(), away: match[2].trim() };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeGame(raw: any): PolymarketGame | null {
  if (!raw?.id) return null;

  const title = String(raw.title ?? raw.question ?? '').trim();
  const sides = splitTitle(title);
  if (!sides) return null; // Not a head-to-head game market.

  // The moneyline market is the one whose outcomes name the two sides.
  const markets = Array.isArray(raw.markets) ? raw.markets : [];
  const outcomes: PolymarketOutcome[] = [];

  for (const market of markets) {
    const labels = parseMaybeJsonArray(market?.outcomes).map((o) => String(o));
    const prices = parseMaybeJsonArray(market?.outcomePrices).map((p) => toNumber(p));
    if (labels.length < 2) continue;

    // Prefer a market whose labels are the team names over a Yes/No market.
    const looksLikeMoneyline = labels.some(
      (l) => !/^(yes|no)$/i.test(l.trim())
    );
    if (!looksLikeMoneyline && outcomes.length > 0) continue;

    const mapped = labels.map((label, i) => ({ label, price: prices[i] ?? null }));
    if (looksLikeMoneyline) {
      outcomes.length = 0;
      outcomes.push(...mapped);
      break;
    }
    if (outcomes.length === 0) outcomes.push(...mapped);
  }

  const slug = String(raw.slug ?? raw.id);

  return {
    id: String(raw.id),
    slug,
    title,
    startTime:
      typeof raw.startDate === 'string'
        ? raw.startDate
        : typeof raw.gameStartTime === 'string'
          ? raw.gameStartTime
          : undefined,
    home: sides.home,
    away: sides.away,
    outcomes,
    volume: toNumber(raw.volume),
    liquidity: toNumber(raw.liquidity),
    url: `https://polymarket.com/event/${slug}`,
  };
}

/**
 * Upcoming soccer games. Gamma paginates and mixes non-game markets into the
 * same tag, so anything that is not a head-to-head title is dropped.
 */
export async function getSoccerGames(limit = 100): Promise<PolymarketGame[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    closed: 'false',
    active: 'true',
    tag_slug: 'soccer',
    order: 'startDate',
    ascending: 'true',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await gammaRequest<any>(`/events?${params.toString()}`, 60_000);
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

  return list
    .map(normalizeGame)
    .filter((g: PolymarketGame | null): g is PolymarketGame => g !== null);
}

export function polymarketConfig() {
  return { base: GAMMA_BASE };
}
