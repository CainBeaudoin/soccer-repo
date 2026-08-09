import 'server-only';
import type { NextRequest } from 'next/server';
import type { SportradarCreds } from './sportradar';
import { ACCESS_LEVEL_HEADER, API_KEY_HEADER } from './credential-storage';

/**
 * Credentials supplied by the caller for this request only. Sent as headers
 * rather than query parameters so the key does not land in server access
 * logs, browser history, or a Referer header. Falls back to the server
 * environment when absent.
 */
export function credsFromRequest(request: NextRequest): SportradarCreds {
  const apiKey = request.headers.get(API_KEY_HEADER)?.trim();
  const accessLevel = request.headers.get(ACCESS_LEVEL_HEADER)?.trim();
  return {
    apiKey: apiKey || undefined,
    accessLevel: accessLevel === 'production' || accessLevel === 'trial' ? accessLevel : undefined,
  };
}
