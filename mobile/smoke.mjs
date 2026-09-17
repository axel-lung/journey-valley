/**
 * Drives the Android bundle against a real Journey Valley server, in a
 * phone-sized Chromium.
 *
 * The app is no longer a standalone offline notebook: it signs in, reads the
 * agency's API, and shows a different product depending on who you are. So the
 * test boots the production server on a throwaway database and points the
 * bundle at it — everything the APK does lives here except the Java shell.
 *
 *   npm run build && npm run apk:web && npm run apk:test
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, globSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const www = join(root, "mobile", "dist", "www");
if (!existsSync(join(www, "app.js"))) {
  throw new Error("No bundle to test. Run `npm run apk:web` first.");
}

const API_PORT = 3114;
const API = `http://127.0.0.1:${API_PORT}`;
const dataDir = join(root, ".mobile-smoke");
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

// Le bundle est construit avec l'adresse du serveur ; on vérifie qu'on teste
// bien celui qu'on vient de démarrer, sinon les échecs seraient incompréhensibles.
const bundle = readFileSync(join(www, "app.js"), "utf8");
if (!bundle.includes(API)) {
  throw new Error(
    `Ce bundle vise un autre serveur que ${API}.\n` +
      `Reconstruisez-le : JV_SERVER_URL=${API} npm run apk:web`,
  );
}

const api = spawn("node_modules/.bin/next", ["start", "-p", String(API_PORT)], {
  cwd: root,
  env: {
    ...process.env,
    DATABASE_PATH: join(dataDir, "mobile.db"),
    JV_DISABLE_LIVE_APIS: "1",
    WATCH_CRON_SECRET: "mobile-smoke",
  },
  detached: true,
});
api.stdout.on("data", () => {});
api.stderr.on("data", (chunk) => process.stderr.write(chunk));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const files = createServer((request, response) => {
  const path = request.url === "/" ? "/index.html" : (request.url ?? "/");
  const file = join(www, path.replace(/^\/+/, "").split("?")[0]);
  if (!file.startsWith(www) || !existsSync(file)) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});

await new Promise((done) => files.listen(0, "127.0.0.1", done));
const BASE = `http://127.0.0.1:${files.address().port}`;

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`${API}/login`)).ok) return;
    } catch {
      /* pas encore prêt */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Le serveur n'a pas démarré à temps.");
}

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

async function signIn(page, email) {
  await page.goto(BASE);
  await page.waitForSelector("text=Se connecter");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "journey2026");
  await page.getByRole("button", { name: "Se connecter" }).click();
}

let browser;
try {
  await waitForApi();
  browser = await chromium.launch(chromiumLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // 1. L'écran de connexion, et ce qu'il refuse.
  await page.goto(BASE);
  await page.waitForSelector("text=Journey Valley");
  await page.fill('input[name="email"]', "camille@journeyvalley.app");
  await page.fill('input[name="password"]', "mauvais");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForSelector("text=E-mail ou mot de passe incorrect");
  check(
    "a wrong password is refused, without saying which part was wrong",
    await page.getByText("E-mail ou mot de passe incorrect.").isVisible(),
  );

  // 2. Le conseiller : son portefeuille et sa marge nette.
  await signIn(page, "camille@journeyvalley.app");
  await page.waitForSelector("text=Marge nette, dossiers réservés");
  check("an advisor signs in and sees their portfolio", await page.getByText("Escale Voyages").first().isVisible());
  check(
    "the advisor's home leads with the net margin",
    await page.getByText("Marge nette, dossiers réservés").isVisible(),
  );
  check(
    "the advisor sees which client each file is for",
    await page.getByText(/Sam Ortega|Noor Haddad/).first().isVisible(),
  );

  // 3. Un dossier : programme, prix, marge.
  await page.getByText("Kyoto en automne").click();
  await page.waitForSelector("text=Jour 1");
  check("a file opens on its day-by-day programme", await page.getByText("Jour 1").first().isVisible());
  check(
    "a return leg is a day of its own, not a fortnight of 'en cours'",
    (await page.getByText("retour").count()) >= 1,
  );

  await page.getByRole("button", { name: "Prix" }).click();
  await page.waitForSelector("text=Marge nette");
  check("the advisor sees the purchase cost of each line", await page.getByText(/achat/).first().isVisible());
  check(
    "the non-EU exemption is shown where it applies",
    await page.getByText("Hors UE · marge exonérée").first().isVisible(),
  );

  // 4. Le carnet, imprimable depuis le téléphone.
  await page.getByRole("button", { name: "Documents" }).click();
  await page.getByRole("button", { name: /carnet/ }).click();
  await page.waitForSelector("text=Carnet de voyage");
  check("the travel book opens from the phone", await page.getByText("Le programme").isVisible());
  check(
    "the travel book can be printed or saved as a PDF",
    await page.getByRole("button", { name: "Imprimer / PDF" }).isVisible(),
  );

  // 5. La page pratique, disponible sans réseau.
  await page.getByText("← Retour au voyage").click();
  await page.getByRole("button", { name: "Sur place" }).click();
  await page.waitForSelector("text=En cas de pépin");
  check(
    "the practical sheet works with no network at all",
    await page.getByText("Urgences").first().isVisible(),
  );

  // 6. L'onglet Marges.
  await page.getByRole("button", { name: "Marges" }).click();
  await page.waitForSelector("text=Marge nette, après TVA sur marge");
  check(
    "the margins tab totals the agency net of VAT",
    await page.getByText("Marge nette, après TVA sur marge").isVisible(),
  );

  // 7. Hors ligne : ce qui a été vu reste lisible, et le dit.
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Dossiers" }).click();
  await page.waitForSelector("text=Hors ligne");
  check(
    "what was loaded once still reads offline, and says it is dated",
    await page.getByText(/Hors ligne : voici la dernière version connue/).isVisible(),
  );
  await page.context().setOffline(false);

  // 8. Le voyageur : le même appareil, un autre produit.
  await page.getByRole("button", { name: "Réglages" }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForSelector('input[name="email"]');

  await signIn(page, "sam@journeyvalley.app");
  await page.waitForSelector("text=Espace voyageur");
  check("a client signs in to a travellers' app", await page.getByText("Espace voyageur").isVisible());
  check(
    "the client has no margins tab at all",
    (await page.getByRole("button", { name: "Marges" }).count()) === 0,
  );

  await page.getByText("Week-end à Lisbonne").click();
  await page.waitForSelector("text=Jour 1");
  const clientText = await page.locator("body").innerText();
  check(
    "the client is never shown a purchase cost",
    !clientText.includes("achat") && !clientText.includes("Marge"),
    clientText.match(/.{0,40}(achat|Marge).{0,40}/)?.[0] ?? "",
  );
  check(
    "the client has no price tab either",
    (await page.getByRole("button", { name: "Prix", exact: true }).count()) === 0,
  );

  // 9. Et l'API elle-même ne livre rien à un jeton absent ou faux.
  const anonymous = await fetch(`${API}/api/mobile/home`);
  check("the API refuses a request with no token", anonymous.status === 401);
  const forged = await fetch(`${API}/api/mobile/home`, {
    headers: { authorization: "Bearer not-a-real-token" },
  });
  check("the API refuses a forged token", forged.status === 401);
} finally {
  await browser?.close();
  files.close();
  try {
    process.kill(-api.pid, "SIGTERM");
  } catch {
    api.kill("SIGTERM");
  }
  rmSync(dataDir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
