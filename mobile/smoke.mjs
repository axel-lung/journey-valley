/**
 * Drives the offline bundle that ships inside the APK, in a phone-sized
 * Chromium. Everything the APK does lives here except the Java shell, so this
 * is where the mobile build is actually tested.
 *
 *   npm run apk:web && npm run apk:test
 */
import { createServer } from "node:http";
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const www = resolve(dirname(fileURLToPath(import.meta.url)), "dist", "www");
if (!existsSync(join(www, "app.js"))) {
  throw new Error("No bundle to test. Run `npm run apk:web` first.");
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer((request, response) => {
  const path = request.url === "/" ? "/index.html" : (request.url ?? "/");
  const file = join(www, path.replace(/^\/+/, "").split("?")[0]);
  if (!file.startsWith(www) || !existsSync(file)) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});

await new Promise((done) => server.listen(0, "127.0.0.1", done));
const BASE = `http://127.0.0.1:${server.address().port}`;

function chromiumLaunchOptions() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    ...globSync("/opt/pw-browsers/chromium-*/chrome-linux/chrome"),
    ...globSync(`${process.env.HOME ?? ""}/.cache/ms-playwright/chromium-*/chrome-linux/chrome`),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter((candidate) => candidate && existsSync(candidate));

  if (candidates.length === 0) {
    throw new Error("No Chromium found. Set CHROMIUM_PATH to a Chrome/Chromium binary.");
  }
  return { executablePath: candidates[0] };
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

let browser;
try {
  browser = await chromium.launch(chromiumLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE);

  // 1. First launch seeds the demo trips.
  await page.waitForSelector("text=Road trip dans les fjords norvégiens");
  check("the demo trips are there on first launch", await page.getByText("Week-end à Lisbonne").isVisible());

  // 2. A trip opens with its budget and savings worked out.
  await page.getByText("Road trip dans les fjords norvégiens").click();
  await page.waitForSelector("text=Engagé");
  check("the package saving is shown", await page.getByText("Réserver vous-même vous garde").isVisible());
  check("the saving matches the quote minus the bookings", await page.getByText(/1\s003\s€/).first().isVisible());

  // 3. Shared costs settle between the three travellers.
  check("the settlement is computed", await page.getByText("Pour être quittes").isVisible());
  check("a companion owes their share", await page.getByText(/doit 29\s€/).first().isVisible());

  // 4. Logging an expense moves the balances.
  await page.getByRole("button", { name: "Noter une dépense" }).click();
  await page.locator('input[name="amount"]').fill("90");
  await page.locator('input[name="description"]').fill("Billets de ferry");
  await page.getByRole("button", { name: "Ajouter la dépense" }).click();
  await page.waitForSelector("text=Billets de ferry");
  check("the expense is saved", await page.getByText("Billets de ferry").first().isVisible());
  check("the split is recalculated", await page.getByText(/doit 59\s€/).first().isVisible());

  // 4b. The preparation checklist.
  check(
    "the seeded checklist is there",
    await page.getByText("Permis de conduire international").isVisible(),
  );
  await page.getByRole("button", { name: "Cocher Cartes hors-ligne téléchargées" }).click();
  await page.waitForSelector('button[aria-label="Décocher Cartes hors-ligne téléchargées"]');
  check(
    "a checklist item can be ticked off",
    await page.getByRole("button", { name: "Décocher Cartes hors-ligne téléchargées" }).isVisible(),
  );

  // 4c. The offline travel file: day by day, and what to do in an emergency.
  check(
    "the day-by-day programme is built offline",
    await page.getByText("Jour 1").first().isVisible(),
  );
  check(
    "the practical sheet is available with no network",
    await page.getByText("En cas de pépin").isVisible(),
  );
  check(
    "the practical sheet knows the country",
    await page.getByText("NOK").first().isVisible(),
  );

  // 5. It survives a restart — which is the whole point of the storage layer.
  await page.reload();
  await page.waitForSelector("text=Road trip dans les fjords norvégiens");
  await page.getByText("Road trip dans les fjords norvégiens").click();
  check("data survives a restart", await page.getByText("Billets de ferry").first().isVisible());

  // 5b. An expense can be split between only some of the travellers.
  await page.getByRole("button", { name: "Noter une dépense" }).click();
  const targeted = page.locator("form").filter({ hasText: "Qui participe" });
  await targeted.locator('input[name="amount"]').fill("30");
  await targeted.locator('input[name="description"]').fill("Taxi à deux");
  await targeted.getByRole("button", { name: "Noor", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter la dépense" }).click();
  await page.waitForSelector("text=Taxi à deux");
  check(
    "an expense can name who it concerns",
    await page.getByText(/partagée entre Moi, Sam/).first().isVisible(),
  );

  // 6. A new trip can be planned from the phone.
  await page.getByText("← Tous les voyages").click();
  await page.getByRole("button", { name: "+ Voyage" }).click();
  await page.locator('input[name="title"]').fill("Week-end à Porto");
  await page.locator('input[name="destination_city"]').fill("Porto");
  await page.locator('input[name="budget"]').fill("600");
  await page.locator('input[name="agency_quote"]').fill("950");
  await page.getByRole("button", { name: "Créer", exact: true }).click();
  await page.waitForSelector("text=Week-end à Porto");
  check("a new trip is created as an idea", await page.getByText("Idée").first().isVisible());

  // 7. The stage machine walks it forward.
  await page.getByRole("button", { name: "Passer en préparation" }).click();
  await page.waitForSelector("text=En préparation");
  check("stages move forward", await page.getByText("En préparation").first().isVisible());

  // 8. The savings tab rolls every compared trip up.
  await page.getByRole("button", { name: "Économies" }).click();
  await page.waitForSelector("text=Gardé dans votre poche");
  check("the savings tab lists compared trips", await page.getByText("Road trip dans les fjords norvégiens").first().isVisible());

  // 9. Resetting brings the demo back.
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Recharger la démonstration" }).click();
  await page.waitForSelector("text=Road trip dans les fjords norvégiens");
  check("the demo can be reloaded", (await page.getByText("Week-end à Porto").count()) === 0);
} finally {
  await browser?.close();
  server.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
