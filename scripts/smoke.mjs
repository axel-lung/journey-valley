/**
 * End-to-end smoke test: boots the built app against a throwaway database and
 * walks the paths that matter — sign up, plan a trip, book something against an
 * agency quote, log a split expense, and see the plan limit and the settle-up
 * maths do their job.
 *
 *   npm run build && npm run smoke
 */
import { spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

/**
 * Finds a Chromium already installed on the machine. `playwright-core` never
 * downloads a browser, which keeps `npm install` small for people who only
 * want to run the app — so the smoke test borrows the system one.
 */
function chromiumLaunchOptions() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    ...globSync("/opt/pw-browsers/chromium-*/chrome-linux/chrome"),
    ...globSync(`${process.env.HOME ?? ""}/.cache/ms-playwright/chromium-*/chrome-linux/chrome`),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter((candidate) => candidate && existsSync(candidate));

  if (candidates.length === 0) {
    throw new Error(
      "No Chromium found. Install one, or point CHROMIUM_PATH at a Chrome/Chromium binary.",
    );
  }
  return { executablePath: candidates[0] };
}

const PORT = Number(process.env.SMOKE_PORT ?? 3111);
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO_EMAIL = "camille@journeyvalley.app";
const DEMO_PASSWORD = "journey2026";
const NEW_EMAIL = `smoke-${Date.now()}@example.com`;
const NEW_PASSWORD = "smoke-password";

const dataDir = mkdtempSync(join(tmpdir(), "journey-valley-smoke-"));
// Own process group, so the whole server tree dies with us.
const server = spawn(join("node_modules", ".bin", "next"), ["start", "--port", String(PORT)], {
  env: { ...process.env, DATABASE_PATH: join(dataDir, "smoke.db"), NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
server.stdout.on("data", () => {});
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

const checks = [];
let browser;

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "✓" : "✗"} ${name}${condition || !detail ? "" : ` — ${detail}`}`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${BASE}/login`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server did not start in time");
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`);
  // The tab and the submit button share a label, so address them separately.
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL("**/login");
}

async function createTrip(page, { title, city, country, budget, quote }) {
  await page.goto(`${BASE}/trips/new`);
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="destination_city"]', city);
  await page.fill('input[name="destination_country"]', country);
  await page.fill('input[name="start_date"]', "2026-12-01");
  await page.fill('input[name="end_date"]', "2026-12-06");
  if (budget) await page.fill('input[name="budget"]', budget);
  if (quote) await page.fill('input[name="agency_quote"]', quote);
  await page.getByRole("button", { name: "Create the trip" }).click();
}

try {
  await waitForServer();
  browser = await chromium.launch(chromiumLaunchOptions());
  const page = await browser.newPage();

  // 1. A new visitor signs up.
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.fill('input[name="name"]', "Smoke Tester");
  await page.fill('input[name="email"]', NEW_EMAIL);
  await page.fill('input[name="password"]', NEW_PASSWORD);
  await page.fill('input[name="home_city"]', "Lyon");
  await page.getByRole("button", { name: "Create my free account" }).click();
  await page.waitForURL("**/dashboard");
  check("a new account can sign up and lands on the overview", await page.getByText("Saved vs. agencies").isVisible());

  // 2. Plan a trip with a budget and an agency quote.
  await createTrip(page, {
    title: "Smoke test — Oslo",
    city: "Oslo",
    country: "Norway",
    budget: "1 500",
    quote: "2 000",
  });
  await page.waitForURL(/\/trips\/\d+$/);
  const tripUrl = page.url();
  check("a trip starts as an idea", await page.getByText("Idea").first().isVisible());

  // 3. A booking with its own price feeds the budget and the savings maths.
  await page.getByText("Add a booking").click();
  // Both the booking and expense forms have an `amount` field, so scope to the form.
  const bookingForm = page.locator('form:has(select[name="type"])');
  await bookingForm.locator('input[name="vendor"]').fill("Norwegian");
  await bookingForm.locator('input[name="amount"]').fill("1 200");
  await bookingForm.locator('input[name="start_at"]').fill("2026-12-01");
  await page.getByRole("button", { name: "Add to the trip" }).click();
  await page.waitForSelector("text=Norwegian");
  check("the booking lands on the trip", await page.getByText("Norwegian").first().isVisible());
  check(
    "the package quote produces a saving",
    await page.getByText("Booking it yourself keeps").isVisible(),
  );
  check(
    "the saving is the quote minus what was paid",
    await page.getByText("€800").first().isVisible(),
  );

  // 4. Stage changes follow the machine: idea → planning → booked.
  await page.getByRole("button", { name: "Start planning" }).click();
  await page.waitForSelector("text=Planning");
  await page.getByRole("button", { name: "Everything is booked" }).click();
  await page.waitForSelector("text=Booked");
  check("the trip walks through its stages", await page.getByText("Booked").first().isVisible());

  // 5. On-trip spending shows up against the budget.
  await page.getByText("Log an expense").click();
  const expenseForm = page.locator('form:has(input[name="shared"])');
  await expenseForm.locator('input[name="amount"]').fill("68,40");
  await expenseForm.locator('input[name="spent_on"]').fill("2026-12-02");
  await expenseForm.locator('input[name="description"]').fill("Dinner in Oslo");
  await page.getByRole("button", { name: "Log it" }).click();
  await page.waitForSelector("text=Dinner in Oslo");
  check("an expense is logged", await page.getByText("Dinner in Oslo").first().isVisible());
  check(
    "the expense is counted against the budget",
    await page.getByText("€1,268.40").first().isVisible(),
  );

  // 6. The savings page rolls trips up.
  await page.goto(`${BASE}/savings`);
  check("the savings page lists the trip", await page.getByText("Smoke test — Oslo").first().isVisible());

  // 7. The free plan stops at two active trips.
  await createTrip(page, { title: "Smoke test — Porto", city: "Porto", country: "Portugal" });
  await page.waitForURL(/\/trips\/\d+$/);
  await page.goto(`${BASE}/trips/new`);
  check(
    "the free plan blocks a third active trip",
    await page.getByText("You have reached your plan's limit").isVisible(),
  );

  // 8. Upgrading lifts the limit.
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Upgrade to Plus" }).click();
  await page.waitForSelector("text=Move back to Free");
  await page.goto(`${BASE}/trips/new`);
  check(
    "Plus removes the limit",
    await page.getByRole("button", { name: "Create the trip" }).isVisible(),
  );

  // 9. A trip you are not on is not reachable.
  await signOut(page);
  await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
  const response = await page.goto(tripUrl);
  check("someone else's trip is not visible", response.status() === 404, `status ${response?.status()}`);

  // 10. The seeded shared trip settles up.
  await page.goto(`${BASE}/trips?filter=all`);
  await page.getByText("Lisbon long weekend").click();
  await page.waitForURL(/\/trips\/\d+$/);
  check("shared costs produce a settlement", await page.getByText("Fewest payments").isVisible());
  check("balances are shown per traveller", await page.getByText("Sam Ortega").first().isVisible());
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
  rmSync(dataDir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
