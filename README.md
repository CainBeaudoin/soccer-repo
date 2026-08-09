# Soccer Predictor

Pick a match and get a data-driven outcome prediction — home win, draw, or away win — with a written thesis, powered by the [Sportradar Soccer API](https://developer.sportradar.com/soccer/reference/soccer-api-overview).

## How it works

1. The dashboard lists matches across competitions worldwide for a chosen date (defaults to today), pulled from Sportradar's daily schedule feed.
2. Pick a match and the app fetches current-season standings (and recent form, when available) for both sides and runs a transparent, rules-based comparison — league points per game, goal difference per game, and recent form — with home advantage factored in.
3. You get a predicted outcome (home win / draw / away win), a confidence percentage, a full three-way probability breakdown, and a written thesis explaining exactly which numbers drove the call.
4. Hit **New Prediction** to go back to the match list and pick another fixture.

This is a statistical estimate for informational purposes — not betting advice, and not a guarantee.

## Supplying the API key

There are two ways to give the app a Sportradar key, and either works on its own.

**1. Enter it in the app (no configuration).** On first load the app asks for a key and access level, validates it against Sportradar before accepting it, and keeps it in `sessionStorage` — so it lives in that browser tab only and is dropped when the tab closes. It is never written to the server, the repository, or the JavaScript bundle. Each request carries it in an `x-sportradar-key` header (a header, not a query string, so it stays out of access logs, browser history, and `Referer`). The browser never calls Sportradar directly — this app's own server does — so the key is not exposed to cross-origin requests.

Use "Use a different key" to clear it and enter another.

**2. Set it in the environment.** Set `SPORTRADAR_SOCCER_API_KEY` on the server and the app uses it automatically, skipping the prompt. A key entered in the UI takes precedence over the environment for that request.

`GET /api/soccer/health` reports which source was used and whether Sportradar accepted the key, without ever echoing the key itself.

## Setup

1. Optionally, copy `.env.example` to `.env.local` and fill in your Sportradar key — or skip this entirely and enter the key in the app when it loads:

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

## Odds Comparison

A search bar above the board queries the [Odds Comparison Regular API](https://developer.sportradar.com/) across sports — not just soccer — matching on team, competitor, or competition name. Expanding a result shows consensus pricing from the bookmaker panel.

Prices are shown as decimal odds alongside the probability they imply. That implied figure has the bookmaker margin removed first: raw prices deliberately sum to more than 100% (the excess is the margin, shown per market), so they are normalised back to 100% before being displayed. Only then is the market comparable to this app's model probabilities. The de-vig uses the simple proportional method, which assumes margin is spread evenly across outcomes — standard for a quick comparison, though it does slightly understate favourites, since books in practice load more margin onto longshots.

Because the odds feed is organised per sport per day, a search fans out across sports sequentially with a cap, to stay inside the trial rate limit. A sport your key doesn't cover is skipped rather than failing the search, and the result count reports how many sports were actually reached.

`GET /api/odds/health` verifies the key reaches the Odds Comparison product and lists the sports it can see.

> **Verification status:** the soccer feeds' request/response handling has been exercised directly. The Odds Comparison endpoint paths follow Sportradar's documented v2 conventions but have **not** been run against the live API from this codebase — they are collected in one block at the top of `src/lib/odds/client.ts`, and the URL segment is overridable via `SPORTRADAR_ODDS_BASE`. If a call 404s, that block is the first thing to check; `/api/odds/health` reports which part failed.

## Project structure

- `src/lib/soccer/sportradar.ts` — server-only Sportradar client + response normalization.
- `src/lib/soccer/predict.ts` — the prediction heuristic (pure function, no I/O; produces home/draw/away probabilities).
- `src/app/api/soccer/schedule/route.ts` — daily schedule endpoint.
- `src/app/api/soccer/predict/route.ts` — prediction endpoint.
- `src/app/page.tsx` — the dashboard UI.
