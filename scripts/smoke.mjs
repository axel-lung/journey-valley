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

const CRON_SECRET = "smoke-cron-secret";
const dataDir = mkdtempSync(join(tmpdir(), "journey-valley-smoke-"));
// Own process group, so the whole server tree dies with us.
const server = spawn(join("node_modules", ".bin", "next"), ["start", "--port", String(PORT)], {
  env: {
    ...process.env,
    DATABASE_PATH: join(dataDir, "smoke.db"),
    NODE_ENV: "production",
    WATCH_CRON_SECRET: CRON_SECRET,
  },
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
  await page.getByRole("button", { name: "J'ai un compte" }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator("form").getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL("**/dashboard");
}

async function signOut(page) {
  await page.getByRole("button", { name: /Se déconnecter|Quitter/ }).first().click();
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
  await page.getByRole("button", { name: "Créer le voyage" }).click();
}

try {
  await waitForServer();
  browser = await chromium.launch(chromiumLaunchOptions());
  const page = await browser.newPage();

  // 1. A new visitor signs up.
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "Je m'inscris" }).click();
  await page.fill('input[name="name"]', "Smoke Tester");
  await page.fill('input[name="email"]', NEW_EMAIL);
  await page.fill('input[name="password"]', NEW_PASSWORD);
  await page.fill('input[name="home_city"]', "Lyon");
  await page.getByRole("button", { name: "Créer mon compte gratuit" }).click();
  await page.waitForURL("**/dashboard");
  check("a new account can sign up and lands on the overview", await page.getByText("Gardé dans votre poche").first().isVisible());

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
  check("a trip starts as an idea", await page.getByText("Idée").first().isVisible());

  // 3. A booking with its own price feeds the budget and the savings maths.
  await page.getByText("Ajouter une réservation").click();
  // Both the booking and expense forms have an `amount` field, so scope to the form.
  const bookingForm = page.locator('form:has(select[name="type"])');
  await bookingForm.locator('input[name="vendor"]').fill("Norwegian");
  await bookingForm.locator('input[name="amount"]').fill("1 200");
  await bookingForm.locator('input[name="start_at"]').fill("2026-12-01");
  await page.getByRole("button", { name: "Ajouter au voyage" }).click();
  await page.waitForSelector("text=Norwegian");
  check("the booking lands on the trip", await page.getByText("Norwegian").first().isVisible());
  // The trip is still an idea, so the package comparison must say it is provisional.
  check(
    "a package quote on an unbooked trip is flagged provisional",
    await page.getByText("n'est pas entièrement réservé").isVisible(),
  );

  // 4. Stage changes follow the machine: idea → planning → booked.
  await page.getByRole("button", { name: "Passer en préparation" }).click();
  await page.waitForSelector("text=En préparation");
  await page.getByRole("button", { name: "Tout est réservé" }).click();
  // "Réservé" also appears in the bookings heading, so wait on the saving copy
  // that only a finished booking produces.
  await page.waitForSelector("text=Réserver vous-même vous garde");
  check(
    "the trip walks through its stages",
    await page.getByRole("button", { name: "C'est parti !" }).isVisible(),
  );
  // Once booked, the same comparison becomes a real saving.
  check(
    "the saving becomes final once everything is booked",
    await page.getByText("Réserver vous-même vous garde").isVisible(),
  );
  check(
    "the saving is the quote minus what was paid",
    await page.getByText("800 €").first().isVisible(),
  );

  // 5. On-trip spending shows up against the budget.
  await page.getByText("Noter une dépense").click();
  const expenseForm = page.locator('form:has(input[name="shared"])');
  await expenseForm.locator('input[name="amount"]').fill("68,40");
  await expenseForm.locator('input[name="spent_on"]').fill("2026-12-02");
  await expenseForm.locator('input[name="description"]').fill("Dinner in Oslo");
  await page.getByRole("button", { name: "Ajouter la dépense" }).click();
  await page.waitForSelector("text=Dinner in Oslo");
  check("an expense is logged", await page.getByText("Dinner in Oslo").first().isVisible());
  check(
    "the expense is counted against the budget",
    await page.getByText(/1\s268,40\s€/).first().isVisible(),
  );

  // 5b. Search, import a result, and set a price alert.
  const searchForm = page.locator('form:has(input[name="target"])');
  await searchForm.locator('input[name="destination"]').fill("Oslo");
  await searchForm.locator('input[name="target"]').fill("400");
  await page.getByRole("button", { name: "Chercher" }).click();
  await page.waitForSelector("text=Estimations, pas des offres réelles");
  check(
    "offline results are labelled as estimates, never as offers",
    await page.getByText("ne correspondent à aucune offre réservable").isVisible(),
  );

  const bookingsBefore = await page.locator("text=/^Réservations \\(\\d+\\)$/").innerText();
  await page.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await page.waitForFunction(
    (before) => !document.body.innerText.includes(before),
    bookingsBefore,
  );
  check(
    "a search result can be imported as a booking",
    (await page.locator("text=/^Réservations \\(\\d+\\)$/").innerText()) !== bookingsBefore,
  );

  await searchForm.locator('input[name="destination"]').fill("Oslo");
  await searchForm.locator('input[name="target"]').fill("400");
  await page.getByRole("button", { name: "Surveiller ce prix" }).click();
  await page.waitForSelector("text=Vérifier maintenant");
  check("a price alert can be created", await page.getByText(/Vol .*Oslo/).first().isVisible());

  await page.getByRole("button", { name: "Vérifier maintenant" }).click();
  await page.waitForSelector("text=Dernière vérification");
  check(
    "checking an alert records a price",
    await page.getByText("Dernière vérification").first().isVisible(),
  );

  // 5c. The scheduled sweep, behind its shared secret.
  const unauthorised = await fetch(`${BASE}/api/watches/check`, { method: "POST" });
  check("the scheduled sweep refuses an unsigned call", unauthorised.status === 401);

  const sweep = await fetch(`${BASE}/api/watches/check`, {
    method: "POST",
    headers: { "x-cron-key": CRON_SECRET },
  });
  const sweepBody = await sweep.json();
  check(
    "the scheduled sweep checks the watches",
    sweep.ok && sweepBody.checked >= 1,
    JSON.stringify(sweepBody),
  );

  // 6. The preparation checklist.
  await page.getByRole("button", { name: "Ajouter les essentiels" }).click();
  await page.waitForSelector("text=Assurance voyage");
  check("the checklist template can be added", await page.getByText("Assurance voyage").isVisible());
  await page.getByRole("button", { name: /^Cocher Assurance voyage$/ }).click();
  await page.waitForSelector('button[aria-label="Décocher Assurance voyage"]');
  check(
    "a checklist item can be ticked off",
    await page.getByRole("button", { name: "Décocher Assurance voyage" }).isVisible(),
  );

  // 7. The savings page rolls trips up.
  await page.goto(`${BASE}/savings`);
  check("the savings page lists the trip", await page.getByText("Smoke test — Oslo").first().isVisible());

  // 7. The free plan stops at two active trips.
  await createTrip(page, { title: "Smoke test — Porto", city: "Porto", country: "Portugal" });
  await page.waitForURL(/\/trips\/\d+$/);
  await page.goto(`${BASE}/trips/new`);
  check(
    "the free plan blocks a third active trip",
    await page.getByText("limite de votre forfait").first().isVisible(),
  );

  // 8. Upgrading lifts the limit.
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Passer à Plus" }).last().click();
  await page.waitForSelector("text=Revenir à Découverte");
  await page.goto(`${BASE}/trips/new`);
  check(
    "Plus removes the limit",
    await page.getByRole("button", { name: "Créer le voyage" }).isVisible(),
  );

  // 9. A trip you are not on is not reachable.
  await signOut(page);
  await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
  const response = await page.goto(tripUrl);
  check("someone else's trip is not visible", response.status() === 404, `status ${response?.status()}`);

  // 11. The seeded shared trip settles up.
  await page.goto(`${BASE}/trips?filter=all`);
  await page.getByText("Week-end à Lisbonne").click();
  await page.waitForURL(/\/trips\/\d+$/);
  check("shared costs produce a settlement", await page.getByText("Pour être quittes").isVisible());
  check("balances are shown per traveller", await page.getByText("Sam Ortega").first().isVisible());

  // 12. An expense split between only some travellers spares the others.
  await page.getByText("Noter une dépense").click();
  const sharedForm = page.locator('form:has(input[name="participants"])');
  await sharedForm.locator('input[name="amount"]').fill("40");
  await sharedForm.locator('input[name="description"]').fill("Taxi à deux");
  // Untick Sam, leaving the cost on Camille alone. The payer dropdown carries
  // the same names, so target the participant chip's own label.
  await sharedForm.locator('label:has(input[name="participants"])', { hasText: "Sam Ortega" }).click();
  await page.getByRole("button", { name: "Ajouter la dépense" }).click();
  await page.waitForSelector("text=Taxi à deux");
  check(
    "an expense can name who it concerns",
    await page.getByText(/partagée entre Camille/).first().isVisible(),
  );
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
