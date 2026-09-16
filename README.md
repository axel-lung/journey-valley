# Journey Valley

A SaaS for people who plan their own holidays instead of buying a package — and want to see
what that decision is worth.

You keep a trip's flights, stays, car hire and activities in one place, log what everyone spends
while you are there, and record what a travel agency quoted for the same thing. Journey Valley
does the arithmetic: how much of the budget is left, what each traveller owes, and how much of
the agency's margin stayed in your pocket.

The interface is in French; the code, comments and tests are in English.

## What it does

- **Trips through their real stages** — idea → planning → booked → on the road → completed. The
  stage machine decides what each person may do; a companion can mark things booked, only the
  organiser can cancel.
- **Savings against an agency quote.** Record a package quote for the whole trip, or a comparable
  price on individual bookings. The comparison never inflates the figure: with per-booking quotes
  only the quoted lines are compared, on both sides, and a package quote on a trip that is still
  being booked is marked provisional and kept out of the totals.
- **A checklist per trip** — passport, insurance, adaptor — with a one-tap template of the things
  almost every trip needs.
- **Expenses split between the people they concern**, not always the whole group: the taxi three
  of you took is split three ways, and everyone else stays out of it.
- **A settle-up you can paste into the group chat**, as text, in one tap.
- **Search for flights, stays and activities from inside a trip**, and add a result as a booking in
  one tap. See *Search providers* below for what is and is not connected.
- **Price alerts.** Watch a route or a stay, set the price you want to be told about, and let the
  scheduled sweep re-check it.
- **An estimate of what the same trip would cost as a package**, from the usual industry margins —
  shown as an order of magnitude, deliberately kept out of the savings totals.
- **A budget you can actually read** — committed vs. remaining, per traveller, with the overrun
  called out rather than hidden.
- **Shared costs, settled fairly.** Expenses are split evenly or kept personal; rounding cents are
  rotated between travellers so shares are whole cents and still add up exactly. The settle-up view
  turns balances into the fewest payments that square everyone off.
- **Countdowns and dates in French** — `J − 12`, `12 – 21 oct. 2026` — from one tested module.
- **Companions.** Invite people by the email they signed up with; they see the trip, add their own
  bookings and expenses, and are counted in every split.
- **Free and Plus plans.** Free keeps two trips active with one companion each; Plus lifts both
  limits. The limits are enforced server-side, not just hidden in the UI.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The SQLite database is created, migrated and seeded on first use, so there is nothing to set up.
Sign in with the seeded demo account:

| Account | Password |
| --- | --- |
| `camille@journeyvalley.app` (Plus, 5 trips) | `journey2026` |
| `sam@journeyvalley.app` (Free, sees two trips as a companion) | `journey2026` |

Or create a new account from the same screen — signup is a real flow, not a mock.

### Configuration

Copy `.env.example` to `.env` if you want to change the defaults:

- `DATABASE_PATH` — where the SQLite file lives (default `./data/journey-valley.db`).
- `AMADEUS_CLIENT_ID` / `AMADEUS_CLIENT_SECRET` / `AMADEUS_ENV` — live flight search.
- `WATCH_CRON_SECRET` — shared secret for the scheduled price-watch sweep.

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

There is a standalone APK too — the same trips, budgets, agency comparison and cost splitting,
running entirely on the phone with no account and no network:

```bash
npm run apk      # → mobile/dist/journey-valley.apk
```

It shares the domain logic with this app rather than reimplementing it. See
[`mobile/README.md`](mobile/README.md) for what it does and does not do.

## Checks

```bash
npm test         # unit tests for the money, budget, savings, split and stage logic
npm run typecheck
npm run build
npm run smoke    # end-to-end: signup → trip → booking → expense → plan limit → settle up
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
- **The interesting logic is pure and tested.** `budget.ts` (budgets, agency savings, cost
  splitting, settlement), `stages.ts` (who may move a trip where) and `format.ts` (French dates and
  countdowns) have no database or React dependency, so `npm test` covers them directly.
- **Authorisation is by membership.** Trip queries join `trip_members`, so a trip you are not on
  returns nothing at all — the smoke test checks that another account's trip 404s.

```
src/
  app/
    login/            sign in and sign up
    (app)/            everything behind a session
      dashboard/      overview, spending chart, activity
      trips/          list, create, and the trip page (bookings, expenses, companions, settle up)
      spending/       every expense across your trips
      savings/        agency comparison, trip by trip
      account/        plan and profile
    api/watches/      the scheduled price-watch sweep
  components/         shared UI, nav, charts
  lib/                domain logic, database, auth
    search/           provider interface, offline estimates, Amadeus adapter
scripts/smoke.mjs     end-to-end browser test
```

## Known gaps

- The Amadeus adapter is unverified against the live service, and covers flights only: stays and
  activities always fall back to the offline estimates.
- Price alerts notify inside the app only — they land in the trip's activity feed, not in an inbox.

- Plan changes flip immediately; a real deployment would go through a payment provider and switch
  the plan on a confirmed webhook.
- Receipts are recorded by file name only — there is no upload or storage yet.
- The interface is French only; there is no translation layer, the strings are in the components.
- Companions must already have an account; there is no email invitation.
- Every trip is priced in the owner's currency. Cross-currency trips would need conversion at a
  recorded rate, not a display-time one.
