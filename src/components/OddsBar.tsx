'use client';

import type { MatchOutcome, PredictionResult } from '@/lib/soccer/predict';

interface Props {
  prediction: PredictionResult;
  homeName: string;
  awayName: string;
}

/**
 * Three-way outcome split as a single stacked bar plus labelled percentages,
 * so a match can be read at a glance without opening it. The favoured
 * outcome is the only one carrying the accent colour.
 */
export default function OddsBar({ prediction, homeName, awayName }: Props) {
  const { probabilities, outcome } = prediction;

  const segments: { key: MatchOutcome; label: string; pct: number }[] = [
    { key: 'home', label: homeName, pct: probabilities.home },
    { key: 'draw', label: 'Draw', pct: probabilities.draw },
    { key: 'away', label: awayName, pct: probabilities.away },
  ];

  return (
    <div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-white/5" aria-hidden="true">
        {segments.map((seg) => (
          <div
            key={seg.key}
            style={{ width: `${seg.pct}%` }}
            className={
              seg.key === outcome
                ? 'bg-[#3fae5f]'
                : seg.key === 'draw'
                  ? 'bg-white/25'
                  : 'bg-white/15'
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mt-1.5">
        {segments.map((seg) => (
          <span
            key={seg.key}
            className={`text-[11px] truncate ${
              seg.key === outcome ? 'text-[#3fae5f] font-semibold' : 'text-white/40'
            }`}
          >
            {seg.key === 'draw' ? 'Draw' : seg.label}{' '}
            <span className="tabular-nums">{seg.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
