/**
 * Matching checks for the Polymarket <-> Sportradar cross-reference.
 *
 * Run with:  npx tsx src/lib/polymarket/__tests__/matching.test.ts
 *
 * Deliberately dependency-free so it runs without a test-runner install.
 * The failure mode this guards against is asymmetric: missing a pairing
 * costs a row on screen, but a wrong pairing attaches a prediction to the
 * wrong fixture, so the "must not match" cases matter more than the rest.
 */
import { teamSimilarity } from '../normalize';
import { matchFixtures } from '../matching';

const TEAM_THRESHOLD = 0.6;
let failures = 0;

function checkName(a: string, b: string, shouldMatch: boolean) {
  const score = teamSimilarity(a, b);
  const matched = score >= TEAM_THRESHOLD;
  if (matched !== shouldMatch) {
    failures++;
    console.error(
      `FAIL  "${a}" / "${b}" scored ${score.toFixed(3)} → ${matched ? 'match' : 'different'}, expected ${
        shouldMatch ? 'match' : 'different'
      }`
    );
  }
}

// Same club, named differently by the two sources.
checkName('Man City', 'Manchester City', true);
checkName('Man Utd', 'Manchester United', true);
checkName('Spurs', 'Tottenham Hotspur', true);
checkName('PSG', 'Paris Saint-Germain', true);
checkName('Bayern Munich', 'FC Bayern München', true);
checkName('Inter Milan', 'FC Internazionale Milano', true);
checkName('Barcelona', 'FC Barcelona', true);
checkName('Real Madrid', 'Real Madrid CF', true);
checkName('Atletico Madrid', 'Atlético de Madrid', true);
checkName('Wolves', 'Wolverhampton Wanderers', true);
checkName('Brighton', 'Brighton & Hove Albion', true);
checkName('Dortmund', 'Borussia Dortmund', true);
checkName('Leverkusen', 'Bayer 04 Leverkusen', true);
checkName('West Ham', 'West Ham United', true);
checkName('Sporting CP', 'Sporting Clube de Portugal', true);
checkName('LA Galaxy', 'Los Angeles Galaxy', true);

// Different clubs that share a city or a first word — the dangerous cases.
checkName('Manchester City', 'Manchester United', false);
checkName('Real Madrid', 'Real Sociedad', false);
checkName('Real Madrid', 'Atletico Madrid', false);
checkName('Inter Milan', 'AC Milan', false);
checkName('Sheffield United', 'Sheffield Wednesday', false);
checkName('Borussia Dortmund', 'Borussia Monchengladbach', false);
checkName('Nottingham Forest', 'Norwich City', false);

// Fixture-level: two clubs sharing a city name are separated by the
// opponent, which name similarity alone cannot do.
const poly = [
  { id: 'p1', home: 'Los Angeles FC', away: 'Seattle Sounders', startTime: '2026-08-10T02:00:00Z' },
  { id: 'p2', home: 'LA Galaxy', away: 'Portland Timbers', startTime: '2026-08-10T02:30:00Z' },
  { id: 'p3', home: 'Man City', away: 'Spurs', startTime: '2026-08-10T14:00:00Z' },
];
const sr = [
  { id: 's1', home: 'Los Angeles Galaxy', away: 'Portland Timbers', startTime: '2026-08-10T02:30:00Z' },
  { id: 's2', home: 'Los Angeles Football Club', away: 'Seattle Sounders FC', startTime: '2026-08-10T02:00:00Z' },
  { id: 's3', home: 'Manchester City FC', away: 'Tottenham Hotspur FC', startTime: '2026-08-10T14:00:00Z' },
  // Same two clubs, a fortnight later: must not be paired with p3.
  { id: 's4', home: 'Manchester City FC', away: 'Tottenham Hotspur FC', startTime: '2026-08-24T14:00:00Z' },
];

const { matched } = matchFixtures(poly, sr);
const pairing = new Map(matched.map((m) => [m.a.id, m.b.id]));

for (const [from, to] of [
  ['p1', 's2'],
  ['p2', 's1'],
  ['p3', 's3'],
] as const) {
  if (pairing.get(from) !== to) {
    failures++;
    console.error(`FAIL  fixture ${from} paired with ${pairing.get(from) ?? 'nothing'}, expected ${to}`);
  }
}

if (matched.some((m) => m.b.id === 's4')) {
  failures++;
  console.error('FAIL  a fixture two weeks away was paired on matching names alone');
}

if (failures === 0) {
  console.log('All matching checks passed.');
} else {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
