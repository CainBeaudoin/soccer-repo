# Soccer Predictor

Pick a match and get a data-driven outcome prediction — home win, draw, or away win — with a written thesis, powered by the [Sportradar Soccer API](https://developer.sportradar.com/soccer/reference/soccer-api-overview).

## How it works

1. The dashboard lists matches across competitions worldwide for a chosen date (defaults to today), pulled from Sportradar's daily schedule feed.
2. Pick a match and the app fetches current-season standings (and recent form, when available) for both sides and runs a transparent, rules-based comparison — league points per game, goal difference per game, and recent form — with home advantage factored in.
3. You get a predicted outcome (home win / draw / away win), a confidence percentage, a full three-way probability breakdown, and a written thesis explaining exactly which numbers drove the call.
4. Hit **New Prediction** to go back to the match list and pick another fixture.

This is a statistical estimate for informational purposes — not betting advice, and not a guarantee. The Sportradar API key stays server-side; it's never sent to the browser.

## Setup

1. Copy `.env.example` to `.env.local` and fill in your Sportradar key:

   ```bash
   cp .env.example .env.local
   ```

   ```
   SPORTRADAR_SOCCER_API_KEY=your_key_here
   SPORTRADAR_ACCESS_LEVEL=trial   # or "production", whatever your key was issued for
   SPORTRADAR_LANGUAGE=en
   ```

2. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

## Notes on the Sportradar API

- Trial keys are typically rate-limited to about 1 request/second. The server-side client (`src/lib/soccer/sportradar.ts`) keeps a small in-memory cache (60s for schedules, 5 min for standings/form) to avoid tripping that limit — it's not meant to replace a real cache at scale.
- Response parsing is defensive: soccer's unified `sport_event` schema has several optional/nested fields that vary by competition and coverage tier, so unexpected or missing fields degrade gracefully (the UI says data was incomplete or marks a match "Unavailable") rather than crashing.
- Sportradar addresses league tables by an opaque `season_id`, unlike a simple year — this app reads `season_id` straight off each match in the daily schedule response and carries it through to the prediction request, so no separate season lookup is needed. If Sportradar's coverage tier for a given competition omits season context, that match is shown but marked "Unavailable" for prediction rather than erroring.
- Recent form (`/seasons/{season_id}/form_standings.json`) is treated as a nice-to-have: if the feed doesn't return it for a competition, predictions still work from league table + goal difference alone.

## Project structure

- `src/lib/soccer/sportradar.ts` — server-only Sportradar client + response normalization.
- `src/lib/soccer/predict.ts` — the prediction heuristic (pure function, no I/O; produces home/draw/away probabilities).
- `src/app/api/soccer/schedule/route.ts` — daily schedule endpoint.
- `src/app/api/soccer/predict/route.ts` — prediction endpoint.
- `src/app/page.tsx` — the dashboard UI.
