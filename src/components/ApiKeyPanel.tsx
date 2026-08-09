'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { API_KEY_HEADER, ACCESS_LEVEL_HEADER } from '@/lib/soccer/credential-storage';

interface Props {
  onSaved: (apiKey: string, accessLevel: string) => void;
}

export default function ApiKeyPanel({ onSaved }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [accessLevel, setAccessLevel] = useState('trial');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setChecking(true);
    setError(null);
    try {
      // Validate before storing, so a bad key is caught here rather than
      // surfacing later as a confusing failure on the match list.
      const res = await fetch('/api/soccer/health', {
        headers: { [API_KEY_HEADER]: trimmed, [ACCESS_LEVEL_HEADER]: accessLevel },
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.detail ?? `Validation failed (${res.status}).`);
        return;
      }
      onSaved(trimmed, accessLevel);
    } catch {
      setError('Could not reach the server to validate the key.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="bg-[#121a15] border border-white/10 rounded-2xl p-6 max-w-lg mx-auto">
      <h2 className="text-lg font-bold text-white mb-1">Connect your Sportradar key</h2>
      <p className="text-white/50 text-sm mb-5">
        Your key is kept in this browser tab only and sent to this app&apos;s server solely to call Sportradar.
        It is never stored on the server or written to the repository.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="api-key" className="block text-white/60 text-xs uppercase tracking-wide mb-2">
            Soccer API key
          </label>
          <input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste your Sportradar key"
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-[#0f1512] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#3fae5f]"
          />
        </div>

        <div>
          <label htmlFor="access-level" className="block text-white/60 text-xs uppercase tracking-wide mb-2">
            Access level
          </label>
          <select
            id="access-level"
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value)}
            className="w-full bg-[#0f1512] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#3fae5f]"
          >
            <option value="trial">Trial</option>
            <option value="production">Production</option>
          </select>
          <p className="text-white/30 text-xs mt-2">
            Must match how your key was issued. If one is rejected, try the other.
          </p>
        </div>

        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl px-4 py-3">
            <p className="text-[#ef4444] text-sm font-medium mb-0.5">Key not accepted</p>
            <p className="text-white/50 text-xs">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" loading={checking} disabled={!apiKey.trim()} className="w-full">
          {checking ? 'Checking…' : 'Connect'}
        </Button>
      </form>
    </div>
  );
}
