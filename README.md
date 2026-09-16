# Journey Valley

A SaaS for people who plan their own holidays instead of buying a package — and want to see
what that decision is worth.

You keep a trip's flights, stays, car hire and activities in one place, log what everyone spends
while you are there, and record what a travel agency quoted for the same thing. Journey Valley
does the arithmetic: how much of the budget is left, what each traveller owes, and how much of
the agency's margin stayed in your pocket.

## What it does

- **Trips through their real stages** — idea → planning → booked → on the road → completed. The
  stage machine decides what each person may do; a companion can mark things booked, only the
  organiser can cancel.
- **Savings against an agency quote.** Record a package quote for the whole trip, or a comparable
  price on individual bookings. The comparison never inflates the figure: with per-booking quotes
  only the quoted lines are compared, on both sides.
- **A budget you can actually read** — committed vs. remaining, per traveller, with the overrun
  called out rather than hidden.
- **Shared costs, settled fairly.** Expenses are split evenly or kept personal; rounding cents are
  rotated between travellers so shares are whole cents and still add up exactly. The settle-up view
  turns balances into the fewest payments that square everyone off.
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

## Checks

```bash
npm test         # unit tests for the money, budget, savings, split and stage logic
npm run typecheck
npm run build
npm run smoke    # end-to-end: signup → trip → booking → expense → plan limit → settle up
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
  splitting, settlement) and `stages.ts` (who may move a trip where) have no database or React
  dependency, so `npm test` covers them directly.
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
  components/         shared UI, nav, charts
  lib/                domain logic, database, auth
scripts/smoke.mjs     end-to-end browser test
```

## Known gaps

- Plan changes flip immediately; a real deployment would go through a payment provider and switch
  the plan on a confirmed webhook.
- Receipts are recorded by file name only — there is no upload or storage yet.
- Companions must already have an account; there is no email invitation.
- Every trip is priced in the owner's currency. Cross-currency trips would need conversion at a
  recorded rate, not a display-time one.
