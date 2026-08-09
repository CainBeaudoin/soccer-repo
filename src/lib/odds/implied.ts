import type { ConsensusMarket, OddsOutcome } from './types';

/**
 * Decimal odds express a payout multiple, so their reciprocal is the
 * probability the price implies. A book's prices deliberately sum to more
 * than 1 — that excess is the margin (the "overround"/vig), and it has to
 * be removed before the market can be compared to a model's probabilities.
 */
export function impliedProbability(decimalOdds: number | null): number | null {
  if (decimalOdds === null || !Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  return 1 / decimalOdds;
}

/**
 * Removes the bookmaker margin by normalising the implied probabilities so
 * they sum to 1. This is the simple proportional method: it assumes the
 * margin is spread evenly across outcomes, which is standard for a quick
 * comparison but does understate favourites slightly, since books in
 * practice load more margin onto longshots.
 */
export function devig(market: ConsensusMarket): { outcome: OddsOutcome; fairProbability: number }[] {
  const withProb = market.outcomes
    .map((outcome) => ({ outcome, raw: impliedProbability(outcome.price) }))
    .filter((o): o is { outcome: OddsOutcome; raw: number } => o.raw !== null);

  const total = withProb.reduce((sum, o) => sum + o.raw, 0);
  if (total <= 0) return [];

  return withProb.map(({ outcome, raw }) => ({ outcome, fairProbability: raw / total }));
}

export function overroundOf(market: ConsensusMarket): number | null {
  const probs = market.outcomes.map((o) => impliedProbability(o.price)).filter((p): p is number => p !== null);
  if (probs.length === 0) return null;
  return probs.reduce((a, b) => a + b, 0);
}
