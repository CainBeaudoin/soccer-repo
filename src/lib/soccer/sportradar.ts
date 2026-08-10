import 'server-only';
import type { CompetitorRef, ScheduleMatch, ScheduleResponse, TeamStanding } from './types';

// Read env at request time, not module load. Module-level reads are
// captured once at cold start, which makes a newly-added or changed
// environment variable look "not configured" until the whole instance is
// recycled — the classic symptom after adding a var in a host's dashboard.
/**
 * Per-request credentials. A caller may supply a key and access level (the
 * "bring your own key" path, where the viewer pastes their own credentials
 * into the UI); otherwise the server's environment is used.
 */
export interface SportradarCreds {
  apiKey?: string;
  accessLevel?: string;
}

function config(creds?: SportradarCreds) {
  const apiKey = (creds?.apiKey ?? process.env.SPORTRADAR_SOCCER_API_KEY)?.trim();
  const accessLevel = (creds?.accessLevel || process.env.SPORTRADAR_ACCESS_LEVEL || 'trial').trim();
  const language = (process.env.SPORTRADAR_LANGUAGE || 'en').trim();
  return {
    apiKey,
    accessLevel,
    language,
    baseUrl: `https://api.sportradar.com/soccer/${accessLevel}/v4/${language}`,
  };
}

export function configStatus(creds?: SportradarCreds) {
  const { apiKey, accessLevel, language, baseUrl } = config(creds);
  return {
    apiKeyPresent: Boolean(apiKey),
    apiKeyLength: apiKey?.length ?? 0,
    keySource: creds?.apiKey ? ('request' as const) : apiKey ? ('environment' as const) : ('none' as const),
    accessLevel,
    language,
    baseUrl,
  };
}

export class SportradarError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'SportradarError';
    this.status = status;
  }
}

// Sportradar trial keys are rate-limited to ~1 request/second. A tiny
// in-process cache keeps repeated page loads / multiple users from
// tripping that limit — it is not a substitute for real caching at scale.
type CacheEntry = { expires: number; value: unknown };
const responseCache = new Map<string, CacheEntry>();

/** Distinguishes cache entries per credential without storing the key itself. */
function credFingerprint(apiKey: string, accessLevel: string): string {
  let h = 0;
  const s = `${accessLevel}:${apiKey}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

async function sportradarRequest<T>(path: string, ttlMs: number, creds?: SportradarCreds): Promise<T> {
  const { apiKey, accessLevel, baseUrl } = config(creds);

  if (!apiKey) {
    throw new SportradarError(
      'No Sportradar API key available. Enter one in the app, or set SPORTRADAR_SOCCER_API_KEY on the server (on Vercel: Settings → Environment Variables with the Production scope checked, then redeploy).',
      500
    );
  }

  const cacheKey = `${credFingerprint(apiKey, accessLevel)}|${path}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.value as T;
  }

  const separator = path.includes('?') ? '&' : '?';
  const url = `${baseUrl}${path}${separator}api_key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    if (res.status === 429) {
      throw new SportradarError(
        'Sportradar rate limit exceeded (trial keys allow ~1 request/second). Try again in a moment.',
        429
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new SportradarError(
        `Sportradar rejected the key for access level "${accessLevel}". If this is a production key, switch the access level to "production" (or to "trial" if it is a trial key).`,
        res.status
      );
    }
    if (res.status === 404) {
      throw new SportradarError('No data was found for that date/season.', 404);
    }
    throw new SportradarError(`Sportradar request failed with status ${res.status}.`, res.status);
  }

  const data = (await res.json()) as T;
  responseCache.set(cacheKey, { expires: Date.now() + ttlMs, value: data });
  return data;
}

// The raw Sportradar payload shape is treated defensively (unknown/any)
// rather than trusted 1:1, since soccer's unified sport_event schema has
// several optional/nested fields that vary by competition and coverage
// tier — normalization here fails soft instead of throwing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCompetitor(raw: any): CompetitorRef | null {
  if (!raw || !raw.id) return null;
  const name = typeof raw.name === 'string' ? raw.name : '';
  const abbreviation = typeof raw.abbreviation === 'string' ? raw.abbreviation : '';
  return { id: String(raw.id), name: name || abbreviation || String(raw.id), abbreviation };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMatch(raw: any): ScheduleMatch | null {
  const event = raw?.sport_event;
  if (!event || !event.id) return null;

  const competitors = Array.isArray(event.competitors) ? event.competitors : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const homeRaw = competitors.find((c: any) => c.qualifier === 'home');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const awayRaw = competitors.find((c: any) => c.qualifier === 'away');
  const home = normalizeCompetitor(homeRaw);
  const away = normalizeCompetitor(awayRaw);
  if (!home || !away) return null;

  const status = raw?.sport_event_status;
  const context = event.sport_event_context;

  return {
    id: String(event.id),
    status: typeof status?.status === 'string' ? status.status : 'not_started',
    scheduled: typeof event.start_time === 'string' ? event.start_time : '',
    competitionName: typeof context?.competition?.name === 'string' ? context.competition.name : 'Soccer',
    seasonId: typeof context?.season?.id === 'string' ? context.season.id : null,
    home,
    away,
    homeScore: typeof status?.home_score === 'number' ? status.home_score : undefined,
    awayScore: typeof status?.away_score === 'number' ? status.away_score : undefined,
  };
}

export async function getDailySchedule(date: string, creds?: SportradarCreds): Promise<ScheduleResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await sportradarRequest<any>(`/schedules/${date}/schedules.json`, 60_000, creds);
  const rawMatches = Array.isArray(raw?.schedules) ? raw.schedules : [];

  const matches = rawMatches
    .map(normalizeMatch)
    .filter((m: ScheduleMatch | null): m is ScheduleMatch => m !== null);

  return { date, matches };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeStandingRow(raw: any): TeamStanding | null {
  const competitor = normalizeCompetitor(raw?.competitor ?? raw);
  if (!competitor) return null;

  const played = Number(raw.played ?? 0);
  const win = Number(raw.win ?? raw.wins ?? 0);
  const draw = Number(raw.draw ?? raw.draws ?? 0);
  const loss = Number(raw.loss ?? raw.losses ?? 0);
  const points = Number(raw.points ?? win * 3 + draw);
  const goalsFor = Number(raw.goals_for ?? 0);
  const goalsAgainst = Number(raw.goals_against ?? 0);
  const rank = typeof raw.rank === 'number' ? raw.rank : null;

  return { ...competitor, rank, played, win, draw, loss, points, goalsFor, goalsAgainst };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectStandingRows(raw: any): unknown[] {
  const rows: unknown[] = [];
  const groupsOf = (types: unknown[]) => {
    for (const t of types) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const groups = Array.isArray((t as any)?.groups) ? (t as any).groups : [t];
      for (const g of groups) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const standings = Array.isArray((g as any)?.standings) ? (g as any).standings : [];
        rows.push(...standings);
      }
    }
  };

  if (Array.isArray(raw?.standings)) {
    groupsOf(raw.standings);
  } else if (Array.isArray(raw?.groups)) {
    groupsOf([{ groups: raw.groups }]);
  }

  return rows;
}

export async function getStandings(seasonId: string, creds?: SportradarCreds): Promise<TeamStanding[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await sportradarRequest<any>(
    `/seasons/${encodeURIComponent(seasonId)}/standings.json`,
    5 * 60_000,
    creds
  );
  const rows = collectStandingRows(raw);

  const teams: TeamStanding[] = [];
  for (const row of rows) {
    const standing = normalizeStandingRow(row);
    if (standing) teams.push(standing);
  }
  return teams;
}

export async function getFormStandings(
  seasonId: string,
  creds?: SportradarCreds
): Promise<Map<string, string>> {
  const form = new Map<string, string>();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = await sportradarRequest<any>(
      `/seasons/${encodeURIComponent(seasonId)}/form_standings.json`,
      5 * 60_000,
      creds
    );
    const rows = collectStandingRows(raw);
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any;
      const id = r?.competitor?.id ?? r?.id;
      const formValue = r?.form ?? r?.recent_form;
      if (id && typeof formValue === 'string') {
        form.set(String(id), formValue.toUpperCase());
      }
    }
  } catch {
    // Form standings are a nice-to-have — if the feed rejects it (e.g. not
    // covered for this competition tier), predictions still work without it.
  }
  return form;
}

export interface Competition {
  id: string;
  name: string;
  category: string | null;
}

/**
 * Every competition the key can see. Used to work out which Polymarket
 * leagues this app is actually able to price, rather than assuming.
 */
export async function getCompetitions(creds?: SportradarCreds): Promise<Competition[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await sportradarRequest<any>('/competitions.json', 12 * 60 * 60_000, creds);
  const list = Array.isArray(raw?.competitions) ? raw.competitions : [];

  const out: Competition[] = [];
  for (const c of list) {
    if (!c?.id) continue;
    out.push({
      id: String(c.id),
      name: typeof c.name === 'string' ? c.name : String(c.id),
      category: typeof c.category?.name === 'string' ? c.category.name : null,
    });
  }
  return out;
}

export function findStandingForTeam(standings: TeamStanding[], teamId: string): TeamStanding | null {
  return standings.find((s) => s.id === teamId) ?? null;
}

/**
 * Smallest possible authenticated call, used to validate a key.
 * Competition info always returns a payload for a valid competition, so an
 * empty response can never be mistaken for a rejected key — unlike the
 * daily schedule, which legitimately returns nothing on a quiet date.
 * sr:competition:17 is the Premier League.
 */
export async function getCompetitionInfo(
  competitionId = 'sr:competition:17',
  creds?: SportradarCreds
): Promise<{ name: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await sportradarRequest<any>(
    `/competitions/${encodeURIComponent(competitionId)}/info.json`,
    10 * 60_000,
    creds
  );
  const name = raw?.competition?.name;
  return { name: typeof name === 'string' ? name : null };
}
