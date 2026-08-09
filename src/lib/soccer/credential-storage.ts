/**
 * Shared between client and server, so this module must stay free of
 * `server-only` imports.
 *
 * Credentials are sent as headers rather than query parameters so the key
 * does not land in server access logs, browser history, or a Referer header,
 * and they are held in sessionStorage so they are dropped when the tab
 * closes rather than persisting on disk.
 */
export const API_KEY_HEADER = 'x-sportradar-key';
export const ACCESS_LEVEL_HEADER = 'x-sportradar-access-level';

const KEY_STORAGE = 'sportradar.soccer.apiKey';
const LEVEL_STORAGE = 'sportradar.soccer.accessLevel';

export interface StoredCreds {
  apiKey: string;
  accessLevel: string;
}

function readStorage(): StoredCreds | null {
  if (typeof window === 'undefined') return null;
  try {
    const apiKey = window.sessionStorage.getItem(KEY_STORAGE);
    if (!apiKey) return null;
    return { apiKey, accessLevel: window.sessionStorage.getItem(LEVEL_STORAGE) || 'trial' };
  } catch {
    // Storage can throw when cookies/site data are blocked.
    return null;
  }
}

// useSyncExternalStore compares snapshots by identity, so the cached value
// must stay referentially stable until the credentials actually change —
// returning a freshly-built object on every read would loop forever.
let snapshot: StoredCreds | null = readStorage();
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = readStorage();
  for (const listener of listeners) listener();
}

export function subscribeCreds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCredsSnapshot(): StoredCreds | null {
  return snapshot;
}

/** Server render has no sessionStorage; always start from "not connected". */
export function getCredsServerSnapshot(): StoredCreds | null {
  return null;
}

export function saveCreds(creds: StoredCreds): void {
  try {
    window.sessionStorage.setItem(KEY_STORAGE, creds.apiKey);
    window.sessionStorage.setItem(LEVEL_STORAGE, creds.accessLevel);
  } catch {
    // Non-fatal: the key stays in memory for this page view.
  }
  emit();
}

export function clearCreds(): void {
  try {
    window.sessionStorage.removeItem(KEY_STORAGE);
    window.sessionStorage.removeItem(LEVEL_STORAGE);
  } catch {
    // Nothing to do.
  }
  emit();
}

export function credHeaders(creds: StoredCreds | null): Record<string, string> {
  if (!creds) return {};
  return { [API_KEY_HEADER]: creds.apiKey, [ACCESS_LEVEL_HEADER]: creds.accessLevel };
}
