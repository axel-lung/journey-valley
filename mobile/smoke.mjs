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
  await page.waitForSelector("text=Norway fjords road trip");
  check("the demo trips are there on first launch", await page.getByText("Lisbon long weekend").isVisible());

  // 2. A trip opens with its budget and savings worked out.
  await page.getByText("Norway fjords road trip").click();
  await page.waitForSelector("text=Committed");
  check("the package saving is shown", await page.getByText("Booking it yourself keeps").isVisible());
  check("the saving matches the quote minus the bookings", await page.getByText("€1,003").first().isVisible());

  // 3. Shared costs settle between the three travellers.
  check("the settlement is computed", await page.getByText("Fewest payments").isVisible());
  check("a companion owes their share", await page.getByText("owes €29").first().isVisible());

  // 4. Logging an expense moves the balances.
  await page.getByRole("button", { name: "Log an expense" }).click();
  await page.locator('input[name="amount"]').fill("90");
  await page.locator('input[name="description"]').fill("Ferry tickets");
  await page.getByRole("button", { name: "Log it" }).click();
  await page.waitForSelector("text=Ferry tickets");
  check("the expense is saved", await page.getByText("Ferry tickets").isVisible());
  check("the split is recalculated", await page.getByText("owes €59").first().isVisible());

  // 5. It survives a restart — which is the whole point of the storage layer.
  await page.reload();
  await page.waitForSelector("text=Norway fjords road trip");
  await page.getByText("Norway fjords road trip").click();
  check("data survives a restart", await page.getByText("Ferry tickets").isVisible());

  // 6. A new trip can be planned from the phone.
  await page.getByText("← All trips").click();
  await page.getByRole("button", { name: "+ Trip" }).click();
  await page.locator('input[name="title"]').fill("Weekend in Porto");
  await page.locator('input[name="destination_city"]').fill("Porto");
  await page.locator('input[name="budget"]').fill("600");
  await page.locator('input[name="agency_quote"]').fill("950");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForSelector("text=Weekend in Porto");
  check("a new trip is created as an idea", await page.getByText("Idea").first().isVisible());

  // 7. The stage machine walks it forward.
  await page.getByRole("button", { name: "Start planning" }).click();
  await page.waitForSelector("text=Planning");
  check("stages move forward", await page.getByText("Planning").first().isVisible());

  // 8. The savings tab rolls every compared trip up.
  await page.getByRole("button", { name: "Savings" }).click();
  await page.waitForSelector("text=Kept in your pocket");
  check("the savings tab lists compared trips", await page.getByText("Norway fjords road trip").isVisible());

  // 9. Resetting brings the demo back.
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Reload the demo trips" }).click();
  await page.waitForSelector("text=Norway fjords road trip");
  check("the demo can be reloaded", (await page.getByText("Weekend in Porto").count()) === 0);
} finally {
  await browser?.close();
  server.close();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
