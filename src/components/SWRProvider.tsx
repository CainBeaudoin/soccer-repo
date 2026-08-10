'use client';

import { SWRConfig } from 'swr';

/**
 * Client-side fetch policy, set globally because the defaults are tuned for
 * cheap endpoints and these are not.
 *
 * SWR revalidates on window focus by default, so every tab switch re-ran the
 * schedule and every league table — invisible from the UI but expensive
 * against a ~1 request/second key. Focus and reconnect revalidation are off,
 * and a long de-duplication window collapses the repeat renders that happen
 * while a slow board request is still in flight.
 *
 * Errors are not retried automatically: a 429 answered with more requests is
 * how a rate limit turns into a sustained one. The Refresh control re-runs a
 * request deliberately.
 */
export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
        dedupingInterval: 5 * 60_000,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
