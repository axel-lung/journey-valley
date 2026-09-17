# Journey Valley

A SaaS for independent travel advisors: build the file, price it, see the margin, and hand the
traveller an app that shows them everything except what you paid for it.

Two views of the same file. The advisor sees supplier costs, sell prices, margin in euros and in
both rates. The traveller sees their programme, their documents, their price. Neither view is a
filtered version of the other: they are separate routes, so a forgotten `if` cannot leak a cost.

The interface is in French; the code, comments and tests are in English.

## What it does

### For the agency

- **Margin on every line and every file.** Each booking carries what you paid and what it sells
  for. The file shows the margin, the **taux de marque** (margin ÷ sell) and the **taux de marge**
  (margin ÷ cost) side by side, because confusing the two is how a quote loses money.
- **A pricing assistant that divides instead of multiplying.** At a 15 % target, a €1 000 purchase
  sells at €1 176 — not €1 150. The suggestion is computed, rounded to the euro, and compared with
  what you have actually posted.
- **A margin that admits when it is not final.** Two opposite dangers, both named on screen: a line
  with no sell price makes the figure a *floor*; a package sold against purchases you have not
  finished making makes it a *ceiling*. Only booked files count towards the agency's revenue.
- **A client file** — contacts, notes, every dossier, what each client has been worth.
- **A dashboard for the morning**: what leaves next, what is still a quote, which margins are not
  yet firm.
- **Margins by month of departure**, and file by file, against the target you set.
- **Trips through their real stages** — idea → planning → booked → on the road → completed —
  which double as the pipeline.

### For the traveller

- **Their own space**, on the agency's name, with the programme day by day, what is booked with
  its references, the checklist and the price they pay. No cost, no margin, ever.
- **A destination file**: weather for those dates, what a euro is worth there, what there is to
  see, and the practical page — plugs, emergency number, which side of the road, entry rules.
- **A printable travel book**, which the advisor reads with costs and the traveller reads with
  prices — one document, two truths, neither of them false.
- **An Android app** that carries the lot offline. See [`mobile/README.md`](mobile/README.md).

### Shared by both

- **Search for flights, stays and activities from inside a file**, and add a result in one tap.
  See *Search providers* below for what is and is not connected.
- **Price alerts.** Watch a route or a stay, set the price you want to be told about, and let the
  scheduled sweep re-check it.
- **Expenses split between the people they concern**, for the group files where travellers share
  costs: rounding cents rotate between them so shares are whole cents and still add up exactly.
- **Countdowns and dates in French** — `J − 12`, `12 – 21 oct. 2026` — from one tested module.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The SQLite database is created, migrated and seeded on first use, so there is nothing to set up.
Sign in with the seeded demo account:

| Account | Password |
| --- | --- |
| `camille@journeyvalley.app` — advisor at Escale Voyages | `journey2026` |
| `sam@journeyvalley.app` — her client, travellers' view | `journey2026` |

Sign in as both, one after the other: that contrast is the product. Or create an account from the
same screen — giving an agency name makes you an advisor, leaving it blank makes you a traveller.

### Configuration

Copy `.env.example` to `.env` if you want to change the defaults:

- `DATABASE_PATH` — where the SQLite file lives (default `./data/journey-valley.db`).
- `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` / `AMADEUS_ENV` — live flight search.
- `WATCH_CRON_SECRET` — shared secret for the scheduled price-watch sweep.

## Free services

Everything below needs no key, no account and no card. Each one is optional: when it cannot be
reached the page says which section is missing rather than failing, and `JV_DISABLE_LIVE_APIS=1`
turns the lot off (which is how the test suite runs).

| What | Service | Cache |
| --- | --- | --- |
| Places and coordinates | Nominatim (OpenStreetMap) | 30 days |
| Things to see | Overpass (OpenStreetMap) | 7 days |
| Weather and seasonal normals | Open-Meteo | 6 h / 30 days |
| Exchange rates | Frankfurter (ECB) | 12 h |
| Destination write-up | Wikipedia REST | 30 days |

These are volunteer-run. The app identifies itself with a `User-Agent` (override with
`JV_USER_AGENT`), keeps one timeout, and caches every answer in SQLite — a stale entry is also
what gets served when a service is down. The practical page (plugs, emergency numbers, entry
rules) is curated in `src/lib/practical.ts` rather than fetched, so it works with no network at
all, which is the situation you are in abroad.

None of these could be reached from the machine this was built on, so the parsers are tested
against recorded payloads rather than live calls.

## Search providers

Search is provider-agnostic: `src/lib/search/` defines the interface, and the app picks a provider
per kind of search.

- **Offline estimates** (default). Plausible prices derived from the query itself, stable for a
  given search. They are not offers, cannot be booked, and every screen that shows them says so.
  They exist so the flow is usable — and testable — with no account and no key. They also know
  nothing about geography: a long-haul flight is not priced differently from a short hop.
- **Amadeus Self-Service** (flights), enabled by setting the two credentials above. Written against
  the documented OAuth2 + `/v2/shopping/flight-offers` endpoints. It has never been run against the
  live service — Amadeus was unreachable from the machine this was built on — so treat the first
  live call as something to watch. If it fails or rate-limits, the app falls back to the estimates
  and says which provider actually answered.

Adding another provider means implementing `SearchProvider` and registering it in
`src/lib/search/index.ts`; nothing else in the app needs to change.

### Scheduling the price sweep

`POST /api/watches/check` re-checks every watch. It refuses to run until `WATCH_CRON_SECRET` is
set, so an unconfigured deployment cannot be used to hammer a paid API. Point whatever scheduler
you already have at it:

```cron
0 7 * * *  curl -fsS -X POST https://your-host/api/watches/check -H "x-cron-key: $WATCH_CRON_SECRET"
```

## On Android

There is a standalone APK too — the whole product on the phone, with no account and no Journey
Valley server: trips, budgets, search, price alerts, the destination file, the printable travel
book, the agency comparison and cost splitting.

```bash
npm run apk      # → mobile/dist/journey-valley.apk
```

It shares the domain logic and the API parsers with this app rather than reimplementing them; only
the transport differs, through a Java bridge that may reach six free services and nothing else, and
that *Réglages → Réseau* switches off. See [`mobile/README.md`](mobile/README.md) for what it does
and does not do.

## Checks

```bash
npm test         # unit tests for the money, margin, budget, split and stage logic
npm run typecheck
npm run build
npm run smoke    # end-to-end: open an agency → file a client → price a dossier → read the margin
                 #              → check the traveller is never shown a cost
npm run apk:test # the Android bundle, driven in a phone-sized browser
```

`npm run smoke` boots the production build against a throwaway database and drives a real
browser through the main flows. It needs `npm run build` first, and uses the Chromium already on
the machine when one is available (`CHROMIUM_PATH` overrides it).

## How it is put together

- **Next.js App Router with server actions.** Mutations are server actions; there is no separate
  API layer and no client-side data fetching.
- **SQLite via `better-sqlite3`.** Schema, migrations and the demo seed live in `src/lib/db.ts` and
  `src/lib/seed.ts`. Every query is a prepared statement.
- **Money is integer cents everywhere.** `src/lib/money.ts` parses what people actually type
  (`1 234,56`, `€1,500`, `89`) and formats it back; nothing in the app multiplies a float by 100.
- **The interesting logic is pure and tested.** `margin.ts` (margin, both rates, sell-price
  assistant), `budget.ts` (budgets, cost
  splitting, settlement), `stages.ts` (who may move a trip where) and `format.ts` (French dates and
  countdowns) have no database or React dependency, so `npm test` covers them directly.
- **Authorisation is by membership.** Trip queries join `trip_members`, so a trip you are not on
  returns nothing at all — the smoke test checks that another account's trip 404s.

```
src/
  app/
    login/            sign in and sign up
    (app)/            everything behind a session
      dashboard/      the advisor's morning: pipeline, departures, margins to confirm
      trips/          the dossiers: list, create, and the file itself (lines, margin, search)
      spending/       expenses across the files
      clients/        the agency's client file
      marges/         margin by month and by dossier
      mon-voyage/     the traveller's own space — no cost is ever read here
      account/        plan and profile
    api/watches/      the scheduled price-watch sweep
  components/         shared UI, nav, charts
  lib/                domain logic, database, auth
    search/           provider interface, offline estimates, Amadeus and OSM adapters
    api/              the free services: geocoding, POIs, weather, rates, guide
                      (URLs and parsers per file; live.ts holds the fetching)
scripts/smoke.mjs     end-to-end browser test
```

## Known gaps

- **No quote to send yet.** The advisor prices the file and the client sees the price in their
  space; there is no PDF proposal with an accept button, and no deposit tracking. That is the next
  piece of work, and the one a paying agency will ask for first.
- **A client account is created by signing up, then added to the file by e-mail.** There is no
  invitation flow, so onboarding a traveller takes two steps and a phone call.
- **One agency, one advisor.** The schema carries `agency_id` on the user, but there is no way to
  invite a colleague, and no per-advisor margin split.
- **Plans are still the consumer Free/Plus.** Agency pricing (per agency, not per seat) is decided
  but not implemented, and nothing charges a card.
- No free key-less API exists for flight or hotel prices; those need Amadeus (free tier, keyed).
  OpenStreetMap gives real activities but no prices, so importing one asks for the price rather
  than recording a booking at zero.
- The live integrations (Nominatim, Overpass, Open-Meteo, Frankfurter, Wikipedia) have never run
  against the real services from here — the sandbox has no outbound network. Their parsers are
  covered by fixtures; the first live call is worth watching.
- Entry and visa rules in the practical page are indicative and curated by hand; every screen
  links to France Diplomatie, which is the authority.
- The Amadeus adapter is unverified against the live service, and covers flights only: stays and
  activities always fall back to the offline estimates.
- Price alerts notify inside the app only — they land in the trip's activity feed, not in an inbox.
  On Android they are checked when the traveller taps *Vérifier*: background polling would need a
  foreground service, which this build does not ship.

- Plan changes flip immediately; a real deployment would go through a payment provider and switch
  the plan on a confirmed webhook.
- Receipts are recorded by file name only — there is no upload or storage yet.
- The interface is French only; there is no translation layer, the strings are in the components.
- Companions must already have an account; there is no email invitation.
- Every trip is priced in the owner's currency. Cross-currency trips would need conversion at a
  recorded rate, not a display-time one.
