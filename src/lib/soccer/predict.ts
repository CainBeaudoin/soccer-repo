import type { CompetitorRef, TeamStanding } from './types';

export type MatchOutcome = 'home' | 'draw' | 'away';

export interface PredictionComparisonRow {
  label: string;
  home: string;
  away: string;
  edge: 'home' | 'away' | 'even';
}

export interface PredictionResult {
  outcome: MatchOutcome;
  favoriteFullName: string;
  confidencePct: number;
  probabilities: { home: number; draw: number; away: number };
  thesis: string[];
  comparison: PredictionComparisonRow[];
  dataComplete: boolean;
}

// Roughly matches long-run splits across Europe's top leagues: home sides
// win about 45% of matches, ~27% end level, and away sides take ~28%.
const BASE_HOME = 45;
const BASE_DRAW = 27;
const BASE_AWAY = 28;

function formPointsPerGame(form?: string): number | null {
  if (!form) return null;
  const recent = form.slice(-6);
  if (recent.length === 0) return null;
  let pts = 0;
  for (const ch of recent) {
    if (ch === 'W') pts += 3;
    else if (ch === 'D') pts += 1;
  }
  return pts / recent.length;
}

function spacedForm(form?: string): string {
  if (!form) return '—';
  return form.slice(-6).split('').join('-');
}

/**
 * A transparent, rules-based comparison — not a machine-learned model.
 * Every factor that moves the needle is surfaced in `thesis` and
 * `comparison` so the reasoning is auditable. Informational only, not
 * betting advice.
 */
export function predictMatch(
  home: CompetitorRef,
  away: CompetitorRef,
  homeStanding: TeamStanding | null,
  awayStanding: TeamStanding | null
): PredictionResult {
  let homeScore = BASE_HOME;
  let drawScore = BASE_DRAW;
  let awayScore = BASE_AWAY;

  const thesis: string[] = [];
  const comparison: PredictionComparisonRow[] = [];
  const dataComplete = Boolean(homeStanding && awayStanding && homeStanding.played > 0 && awayStanding.played > 0);

  thesis.push(
    `${home.name} host this one — across Europe's top leagues, home sides win close to 45% of matches and about 27% end in a draw.`
  );

  if (homeStanding && awayStanding && homeStanding.played > 0 && awayStanding.played > 0) {
    const homePpg = homeStanding.points / homeStanding.played;
    const awayPpg = awayStanding.points / awayStanding.played;
    const ppgGap = homePpg - awayPpg;

    homeScore += Math.max(0, ppgGap) * 10;
    awayScore += Math.max(0, -ppgGap) * 10;

    comparison.push({
      label: 'League form',
      home: `${homeStanding.points} pts${homeStanding.rank ? ` (${homeStanding.rank}${ordinalSuffix(homeStanding.rank)})` : ''}`,
      away: `${awayStanding.points} pts${awayStanding.rank ? ` (${awayStanding.rank}${ordinalSuffix(awayStanding.rank)})` : ''}`,
      edge: ppgGap > 0.15 ? 'home' : ppgGap < -0.15 ? 'away' : 'even',
    });

    if (Math.abs(ppgGap) > 0.25) {
      const better = ppgGap > 0 ? home : away;
      const betterStanding = ppgGap > 0 ? homeStanding : awayStanding;
      const worse = ppgGap > 0 ? away : home;
      const worseStanding = ppgGap > 0 ? awayStanding : homeStanding;
      thesis.push(
        `${better.name} are averaging ${(betterStanding.points / betterStanding.played).toFixed(2)} points per match this season, well ahead of ${worse.name}'s ${(worseStanding.points / worseStanding.played).toFixed(2)}.`
      );
    }

    const homeGd = (homeStanding.goalsFor - homeStanding.goalsAgainst) / homeStanding.played;
    const awayGd = (awayStanding.goalsFor - awayStanding.goalsAgainst) / awayStanding.played;
    const gdGap = homeGd - awayGd;

    homeScore += Math.max(0, gdGap) * 6;
    awayScore += Math.max(0, -gdGap) * 6;

    comparison.push({
      label: 'Goal difference / match',
      home: `${homeGd >= 0 ? '+' : ''}${homeGd.toFixed(2)}`,
      away: `${awayGd >= 0 ? '+' : ''}${awayGd.toFixed(2)}`,
      edge: gdGap > 0.15 ? 'home' : gdGap < -0.15 ? 'away' : 'even',
    });

    if (Math.abs(gdGap) > 0.3) {
      const better = gdGap > 0 ? home : away;
      const betterVal = gdGap > 0 ? homeGd : awayGd;
      thesis.push(`${better.name} are outscoring opponents by ${betterVal.toFixed(2)} goals per match on average.`);
    }

    const homeFormPpg = formPointsPerGame(homeStanding.form);
    const awayFormPpg = formPointsPerGame(awayStanding.form);
    if (homeFormPpg !== null && awayFormPpg !== null) {
      const formGap = homeFormPpg - awayFormPpg;
      homeScore += Math.max(0, formGap) * 8;
      awayScore += Math.max(0, -formGap) * 8;
      comparison.push({
        label: 'Recent form',
        home: spacedForm(homeStanding.form),
        away: spacedForm(awayStanding.form),
        edge: formGap > 0.3 ? 'home' : formGap < -0.3 ? 'away' : 'even',
      });
      if (Math.abs(formGap) >= 0.6) {
        const better = formGap > 0 ? home : away;
        const betterForm = formGap > 0 ? homeStanding.form : awayStanding.form;
        thesis.push(`${better.name} carry the better recent form (${spacedForm(betterForm)}).`);
      }
    }

    // Evenly matched sides on the underlying numbers draw more often —
    // nudge the draw probability up rather than forcing a lean either way.
    if (Math.abs(ppgGap) < 0.3 && Math.abs(gdGap) < 0.35) {
      drawScore += 12;
      thesis.push('These sides look closely matched on the underlying numbers, which raises the chance of a draw.');
    }
  } else {
    thesis.push(
      'Season standings were not fully available for one or both sides, so this estimate leans heavily on home advantage alone.'
    );
  }

  const total = homeScore + drawScore + awayScore || 1;
  let homePct = (homeScore / total) * 100;
  let drawPct = (drawScore / total) * 100;
  let awayPct = (awayScore / total) * 100;

  // Clamp into a believable, non-overconfident range — soccer's draw
  // outcome keeps any single result meaningfully more uncertain than a
  // two-outcome sport, so no probability is ever allowed to read as a lock.
  homePct = Math.min(72, Math.max(8, homePct));
  drawPct = Math.min(45, Math.max(12, drawPct));
  awayPct = Math.min(72, Math.max(8, awayPct));
  const clampedTotal = homePct + drawPct + awayPct;
  homePct = (homePct / clampedTotal) * 100;
  drawPct = (drawPct / clampedTotal) * 100;
  awayPct = (awayPct / clampedTotal) * 100;

  let outcome: MatchOutcome = 'home';
  let confidencePct = homePct;
  if (drawPct > confidencePct) {
    outcome = 'draw';
    confidencePct = drawPct;
  }
  if (awayPct > confidencePct) {
    outcome = 'away';
    confidencePct = awayPct;
  }

  const favoriteFullName = outcome === 'home' ? home.name : outcome === 'away' ? away.name : 'Draw';

  thesis.push(
    'This is a statistical estimate based on public season data, not a guarantee — injuries, suspensions, and match context can change everything.'
  );

  return {
    outcome,
    favoriteFullName,
    confidencePct: Math.round(confidencePct),
    probabilities: { home: Math.round(homePct), draw: Math.round(drawPct), away: Math.round(awayPct) },
    thesis,
    comparison,
    dataComplete,
  };
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
