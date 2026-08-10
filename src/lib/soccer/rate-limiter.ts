import 'server-only';

/**
 * Serialises outbound Sportradar calls and collapses duplicates.
 *
 * Three things were tripping the ~1 request/second trial limit:
 *
 * 1. Pacing lived inside each request's own loop, so two overlapping
 *    requests each waited politely while firing at the same instant.
 *    The queue below is module-scoped, so all callers share one pacer.
 * 2. The same URL was fetched repeatedly in parallel — the board and the
 *    cross-reference both need the same standings. Identical in-flight
 *    requests now share a single promise instead of racing.
 * 3. A 429 failed the whole page rather than backing off, which invited a
 *    manual refresh and another burst.
 *
 * Caveat worth stating: this is per-instance state. A serverless platform
 * running several instances concurrently can still exceed the limit in
 * aggregate, because nothing here is shared between them. It removes
 * self-inflicted bursts, not the need for a real quota on a busy deployment.
 */

const MIN_INTERVAL_MS = Number(process.env.SPORTRADAR_MIN_INTERVAL_MS || 1200);
const MAX_RETRIES = 3;

let lastStart = 0;
let chain: Promise<unknown> = Promise.resolve();

const inFlight = new Map<string, Promise<Response>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Queues a call so consecutive requests are at least MIN_INTERVAL_MS apart. */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    return task();
  });
  // Keep the chain alive even when a task rejects, or one failure would
  // permanently wedge every later call.
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Paced fetch with retry on 429. `key` identifies the request for
 * de-duplication — it must include anything that changes the response,
 * including the credentials, so one key's data is never served to another.
 */
export function limitedFetch(key: string, url: string): Promise<Response> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const attempt = async (): Promise<Response> => {
    for (let tryCount = 0; ; tryCount++) {
      const res = await schedule(() => fetch(url, { cache: 'no-store' }));
      if (res.status !== 429 || tryCount >= MAX_RETRIES) return res;

      // Honour Retry-After when present; otherwise back off exponentially.
      const retryAfter = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : MIN_INTERVAL_MS * Math.pow(2, tryCount);
      await sleep(delay);
    }
  };

  const promise = attempt().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
