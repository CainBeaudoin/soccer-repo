'use client';

interface Props {
  competitions: string[];
  selected: string[];
  counts: Record<string, number>;
  onChange: (next: string[]) => void;
}

/**
 * Multi-select competition chips. An empty selection means "all", which
 * keeps the default view complete rather than empty.
 */
export default function LeagueFilter({ competitions, selected, counts, onChange }: Props) {
  if (competitions.length <= 1) return null;

  const toggle = (competition: string) => {
    onChange(
      selected.includes(competition)
        ? selected.filter((c) => c !== competition)
        : [...selected, competition]
    );
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/40 text-xs uppercase tracking-wide">
          Leagues{selected.length > 0 ? ` · ${selected.length} selected` : ''}
        </span>
        {selected.length > 0 && (
          <button
            onClick={() => onChange([])}
            className="text-white/40 hover:text-white text-xs underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {competitions.map((competition) => {
          const active = selected.includes(competition);
          return (
            <button
              key={competition}
              onClick={() => toggle(competition)}
              aria-pressed={active}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-[#3fae5f] border-[#3fae5f] text-black'
                  : 'bg-[#0f1512] border-white/10 text-white/60 hover:text-white hover:border-white/25'
              }`}
            >
              {competition}
              <span className={active ? 'text-black/60 ml-1' : 'text-white/30 ml-1'}>
                {counts[competition] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
