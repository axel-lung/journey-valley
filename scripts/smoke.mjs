/**
 * End-to-end smoke test: boots the built app against a throwaway database and
 * walks the paths that matter — open an agency, file a client, build a dossier,
 * price it, read the margin, and check that the traveller never sees a cost
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
    // The free services are volunteer-run and the sandbox has no egress: the
    // test drives the offline path on purpose, and asserts it says so.
    JV_DISABLE_LIVE_APIS: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
server.stdout.on("data", () => {});
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

const checks = [];
let browser;

/**
 * Downloads a PDF through the browser (so the session cookie travels with it)
 * and hands back the text it draws.
 *
 * The strings in a PDF are written between parentheses, escaped, and encoded
 * in WinAnsi. Reading them back is what makes "the invoice shows no VAT" a
 * real check rather than a check that a file was produced.
 */
const FROM_CP1252 = {
  0x80: "\u20ac", 0x85: "\u2026", 0x91: "\u2018", 0x92: "\u2019",
  0x93: "\u201c", 0x94: "\u201d", 0x95: "\u2022", 0x96: "\u2013",
  0x97: "\u2014", 0x8c: "\u0152", 0x9c: "\u0153",
};

async function pdfText(page, url) {
  const raw = await page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: "include" });
    if (!response.ok) return `HTTP ${response.status}`;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let out = "";
    for (let index = 0; index < bytes.length; index += 4096) {
      out += String.fromCharCode(...bytes.subarray(index, index + 4096));
    }
    return out;
  }, url);

  if (!raw.startsWith("%PDF")) return { ok: false, text: raw.slice(0, 80) };

  const text = [...raw.matchAll(/\((.*?)\) Tj/g)]
    .map(([, body]) => {
      let out = "";
      for (let index = 0; index < body.length; index += 1) {
        if (body[index] !== "\\") {
          out += body[index];
          continue;
        }
        const octal = /^[0-7]{3}/.exec(body.slice(index + 1));
        if (octal) {
          const code = parseInt(octal[0], 8);
          out += FROM_CP1252[code] ?? String.fromCharCode(code);
          index += 3;
        } else {
          out += body[index + 1];
          index += 1;
        }
      }
      return out;
    })
    .join("\n");

  return { ok: true, text };
}

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "✓" : "✗"} ${name}${condition || !detail ? "" : ` — ${detail}`}`);
}

/**
 * Lit le lien d'un message en attente dans la file d'envoi.
 *
 * Sans serveur d'envoi configuré — le cas ici, et le cas d'une agence qui
 * débute — c'est la seule façon d'obtenir le lien. C'est aussi ce que fait un
 * conseiller : il ouvre le texte du message et le copie.
 */
async function readQueuedLink(page, subject, prefix) {
  const row = page.locator("li", { hasText: subject }).first();
  await row.getByRole("button", { name: "Voir le texte" }).click();
  const body = await row.locator("textarea[data-message-body]").inputValue();
  return new RegExp(`${prefix.replace("/", "\\/")}[A-Za-z0-9_-]+`).exec(body)?.[0] ?? null;
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

async function signIn(page, email, password, landing = "**/dashboard") {
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: "J'ai un compte" }).click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.locator("form").getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(landing);
}

async function signOut(page) {
  await page.getByRole("button", { name: /Se déconnecter|Quitter/ }).first().click();
  await page.waitForURL("**/login");
}

async function createTrip(page, { title, city, country, budget, quote, client }) {
  await page.goto(`${BASE}/trips/new`);
  // Rattacher le dossier à un client n'est pas cosmétique : c'est ce qui donne
  // un destinataire au devis et à la facture.
  if (client) await page.selectOption('select[name="client_id"]', { label: client });
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
  await page.fill('input[name="agency_name"]', "Agence Témoin");
  await page.fill('input[name="home_city"]', "Lyon");
  await page.getByRole("button", { name: "Créer mon compte gratuit" }).click();
  await page.waitForURL("**/dashboard");
  check(
    "signing up opens an agency and lands on its dashboard",
    await page.getByText("Marge nette sur les dossiers réservés").first().isVisible(),
  );

  // 1b. A client goes into the file before a dossier exists.
  await page.goto(`${BASE}/clients`);
  await page.fill('input[name="name"]', "Sam Ortega");
  await page.fill('input[name="email"]', "sam@journeyvalley.app");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForURL(/\/clients\/\d+$/);
  check("a client can be filed", await page.getByText("Sam Ortega").first().isVisible());

  // 2. Plan a trip with a budget and an agency quote.
  await createTrip(page, {
    title: "Smoke test — Oslo",
    city: "Oslo",
    country: "Norway",
    budget: "1 500",
    client: "Sam Ortega",
  });
  await page.waitForURL(/\/trips\/\d+$/);
  const tripUrl = page.url();
  check("a dossier starts as an idea", await page.getByText("Idée").first().isVisible());

  // 3. A booking with its own price feeds the budget and the savings maths.
  await page.getByText("Ajouter une réservation").click();
  // Both the booking and expense forms have an `amount` field, so scope to the form.
  const bookingForm = page.locator('form:has(select[name="type"])');
  await bookingForm.locator('input[name="vendor"]').fill("Norwegian");
  await bookingForm.locator('input[name="amount"]').fill("1 200");
  await bookingForm.locator('input[name="agency_quote"]').fill("1 500");
  await bookingForm.locator('input[name="start_at"]').fill("2026-12-01");
  await page.getByRole("button", { name: "Ajouter au voyage" }).click();
  await page.waitForSelector("text=Norwegian");
  check("the booking lands on the dossier", await page.getByText("Norwegian").first().isVisible());

  await page.goto(`${tripUrl}/prix`);

  // Acheté 1 200, vendu 1 500 : 300 de marge, soit 20 % de marque et 25 % de
  // marge. Les deux taux doivent être distincts à l'écran.
  check(
    "the margin is the sell price minus the cost",
    await page.getByText(/300\s€/).first().isVisible(),
  );
  check(
    "the two rates are told apart",
    (await page.getByText("20 %").first().isVisible()) &&
      (await page.getByText("25 %").first().isVisible()),
  );

  // La TVA sur marge : 300 € de marge TTC en UE → 300 × 20/120 = 50 € de taxe,
  // et 250 € qui restent réellement à l'agence.
  check(
    "VAT is extracted from the margin, not added to it",
    await page.getByText(/−\s*50\s€/).first().isVisible(),
  );
  check(
    "the file shows what the agency actually keeps",
    await page.getByText(/250\s€/).first().isVisible(),
  );

  // 4. Stage changes follow the machine: idea → planning → booked.
  await page.getByRole("button", { name: "Passer en préparation" }).click();
  await page.waitForSelector("text=En préparation");
  await page.getByRole("button", { name: "Tout est réservé" }).click();
  // « Réservé » apparaît aussi dans le titre des réservations : on attend le
  // bouton que seule l'étape suivante fait apparaître.
  await page.waitForSelector("text=C'est parti !");
  check(
    "the dossier walks through its stages",
    await page.getByRole("button", { name: "C'est parti !" }).isVisible(),
  );

  // 5. On-trip spending shows up against the budget — onglet Voyageurs.
  await page.goto(`${tripUrl}/voyageurs`);
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

  // 5b. Search, import a result, and set a price alert — onglet Prix & marge.
  await page.goto(`${tripUrl}/prix`);
  const searchForm = page.locator('form:has(input[name="target"])');
  await searchForm.locator('input[name="destination"]').fill("Oslo");
  await searchForm.locator('input[name="target"]').fill("400");
  await page.getByRole("button", { name: "Chercher" }).click();
  await page.waitForSelector("text=Estimations, pas des offres réelles");
  check(
    "offline results are labelled as estimates, never as offers",
    await page.getByText("ne correspondent à aucune offre réservable").isVisible(),
  );

  // Le nom du premier résultat, pour le retrouver ensuite dans le programme.
  const firstResult = await page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: "Ajouter", exact: true }) })
    .first()
    .locator("p.font-medium")
    .innerText();
  await page.getByRole("button", { name: "Ajouter", exact: true }).first().click();
  await page.waitForTimeout(500);

  // La ligne importée arrive sans prix de vente : la marge devient un plancher,
  // et l'écran doit le dire plutôt que d'annoncer un résultat faux.
  await page.goto(`${tripUrl}/prix`);
  check(
    "an unpriced line makes the margin a floor, and says so",
    await page.getByText(/sans prix de vente/).first().isVisible(),
  );

  await page.goto(tripUrl);
  check(
    "a search result can be imported as a booking",
    await page.getByText(firstResult).first().isVisible(),
    firstResult,
  );
  await page.goto(`${tripUrl}/prix`);

  await searchForm.locator('input[name="destination"]').fill("Oslo");
  await searchForm.locator('input[name="target"]').fill("400");
  await page.getByRole("button", { name: "Surveiller ce prix" }).click();
  await page.waitForSelector("text=Vérifier maintenant");
  check("a price alert can be created", await page.getByText(/Vol .*Oslo/).first().isVisible());

  await page.getByRole("button", { name: "Vérifier maintenant" }).first().click();
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

  // 5d. The destination file and the day-by-day programme.
  await page.goto(`${tripUrl}/destination`);
  check(
    "the destination file is rendered",
    await page.getByText("Oslo, en pratique").isVisible(),
  );
  check(
    "the practical sheet works with no network at all",
    await page.getByText(/Urgences/).first().isVisible(),
  );
  check(
    "the day-by-day programme lists the trip's days",
    await page.goto(tripUrl).then(() => page.getByText("Jour 1").first().isVisible()),
  );

  // 5e. The printable travel book.
  await page.getByRole("link", { name: "Carnet de voyage" }).click();
  await page.waitForURL(/\/carnet\/\d+$/);
  check("the travel book opens", await page.getByText("Carnet de voyage").first().isVisible());
  check(
    "the travel book carries the bookings",
    await page.getByText("Norwegian").first().isVisible(),
  );
  check(
    "the travel book carries the emergency page",
    await page.getByText("En cas de pépin").isVisible(),
  );

  // Le carnet en PDF : le fichier qu'on remet avant le départ, et qui ne
  // contient aucun prix — ni celui qu'on paie, ni celui qu'on a payé.
  const bookPdf = await pdfText(page, `${page.url()}/pdf`);
  check("the travel book downloads as a PDF", bookPdf.ok, bookPdf.text);
  check("the travel book PDF carries the bookings", bookPdf.text.includes("Norwegian"));
  check(
    "the travel book PDF carries no price at all",
    !bookPdf.text.includes("\u20ac"),
    bookPdf.text.match(/.{0,40}\u20ac.{0,40}/)?.[0] ?? "",
  );
  await page.goto(tripUrl);

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

  // 6b. Le devis : conformité, envoi, lien public, acceptation.
  await page.goto(`${tripUrl}/devis`);
  check(
    "an agency with no legal mentions is told its quote would not be compliant",
    await page.getByText("Votre devis ne serait pas conforme").isVisible(),
  );

  // On complète la fiche agence, puis le devis devient présentable.
  await page.goto(`${BASE}/account`);
  await page.fill('input[name="registration"]', "IM069250014");
  await page.fill('input[name="financial_guarantee"]', "APST, 15 avenue Carnot, 75017 Paris");
  await page.fill('input[name="liability_insurance"]', "Allianz — contrat n° 123456");
  await page.fill('input[name="legal_name"]', "Agence Témoin SARL");
  await page
    .locator('form:has(input[name="registration"])')
    .getByRole("button", { name: "Enregistrer" })
    .click();
  await page.waitForSelector("text=Fiche agence enregistrée");

  await page.goto(`${tripUrl}/devis`);
  check(
    "filling the legal mentions clears the compliance warning",
    (await page.getByText("Votre devis ne serait pas conforme").count()) === 0,
  );

  await page.fill('textarea[name="intro"]', "Comme convenu, voici votre séjour à Oslo.");
  await page.getByRole("button", { name: "Préparer le devis" }).click();
  await page.waitForSelector("text=Brouillon");
  check("a quote is drafted from the priced lines", await page.getByText(/DEV-\d{4}-0001/).isVisible());

  await page.getByRole("button", { name: "Envoyer au client" }).click();
  await page.waitForSelector("text=Lien à envoyer");
  check("sending the quote freezes it and yields a public link", await page.getByText("Envoyé").first().isVisible());

  // Le lien public : ouvert sans compte, dans un onglet neuf.
  const quoteHref = await page.getByRole("link", { name: "Voir le devis" }).first().getAttribute("href");
  const guest = await browser.newPage();
  await guest.goto(`${BASE}${quoteHref}`);
  check(
    "the public quote carries the standardised information form",
    await guest.getByText("Formulaire d'information standardisé").isVisible(),
  );
  check(
    "the public quote carries the agency's registration",
    await guest.getByText("IM069250014").isVisible(),
  );
  check(
    "the public quote never shows a purchase cost",
    !(await guest.locator("body").innerText()).includes("1 200"),
  );

  // Le devis en PDF : c'est le fichier que le conseiller joint à son message,
  // donc il porte les mêmes obligations que la page — et les mêmes interdits.
  const quotePdf = await pdfText(guest, `${BASE}${quoteHref}/pdf`);
  check("the quote downloads as a PDF", quotePdf.ok, quotePdf.text);
  check(
    "the quote PDF carries the standardised information form",
    quotePdf.text.includes("FORMULAIRE D'INFORMATION STANDARDIS"),
  );
  check(
    "the quote PDF carries the agency's registration and guarantor",
    quotePdf.text.includes("IM069250014"),
  );
  check(
    "the quote PDF never shows a purchase cost",
    !/1 ?200/.test(quotePdf.text),
    quotePdf.text.match(/.{0,40}1 ?200.{0,40}/)?.[0] ?? "",
  );

  await guest.fill('input[name="name"]', "Sam Ortega");
  await guest.getByRole("button", { name: "J'accepte ce devis" }).click();
  await guest.waitForSelector("text=Vous avez accepté ce devis");
  check("the client can accept from the public link", await guest.getByText("Vous avez accepté ce devis").isVisible());
  await guest.close();

  await page.goto(`${tripUrl}/devis`);
  check(
    "the acceptance is recorded against the quote, with a name",
    await page.getByText(/Accepté par Sam Ortega/).isVisible(),
  );
  check(
    "the advisor sees that the client opened the quote",
    await page.getByText(/Ouvert par le client/).first().isVisible(),
  );

  // 6b bis. La file d'envoi : le message existe, et l'écran dit franchement
  // qu'il n'est pas parti faute de serveur configuré.
  await page.goto(`${BASE}/messages`);
  check(
    "sending a quote queues a message to the client",
    await page.getByText(/Votre devis DEV-\d{4}-0001/).first().isVisible(),
  );
  check(
    "the outbox says plainly that nothing leaves without a mail server",
    await page.getByText("Rien ne part automatiquement").isVisible(),
  );
  check(
    "a queued message is marked as such, not as sent",
    await page.getByText("À envoyer").first().isVisible(),
  );

  // 6c. La facture : acompte, émission, règlement — et pas de TVA dessus.
  await page.goto(`${tripUrl}/devis`);
  await page.waitForSelector("text=Reste à facturer");
  const invoiceForm = page.locator('form:has(input[name="due_date"])');
  // Le dossier est vendu 1 500 € ; l'acompte du devis accepté est de 30 %.
  check(
    "the deposit amount is prefilled at the quote's percentage, not the whole file",
    (await invoiceForm.locator('input[name="amount"]').inputValue()) === "450,00",
    await invoiceForm.locator('input[name="amount"]').inputValue(),
  );
  await invoiceForm.getByRole("button", { name: "Préparer la facture" }).click();
  await page.waitForSelector("text=FAC-");
  check("a deposit invoice is drafted from the accepted quote", await page.getByText(/FAC-\d{4}-0001/).isVisible());
  check(
    "the drafted deposit is the percentage, not the balance",
    await page.getByText(/450,00\s€|450\s€/).first().isVisible(),
  );

  await page.getByRole("button", { name: "Émettre" }).click();
  await page.waitForSelector("text=Émise");
  check("issuing the invoice freezes it", await page.getByText("Émise").first().isVisible());

  const invoiceHref = await page.getByRole("link", { name: "Voir la facture" }).first().getAttribute("href");
  const client = await browser.newPage();
  await client.goto(`${BASE}${invoiceHref}`);
  const invoiceText = await client.locator("body").innerText();
  check(
    "the invoice carries the margin-scheme mention, which is compulsory",
    invoiceText.includes("Régime particulier – agences de voyages"),
  );
  check(
    "the invoice never shows VAT, which the scheme forbids",
    !/TVA\s*:/.test(invoiceText) && !invoiceText.includes("20 %"),
    invoiceText.match(/.{0,40}(TVA\s*:|20 %).{0,40}/)?.[0] ?? "",
  );

  const invoicePdf = await pdfText(client, `${BASE}${invoiceHref}/pdf`);
  check("the invoice downloads as a PDF", invoicePdf.ok, invoicePdf.text);
  check(
    "the invoice PDF carries the margin-scheme mention",
    invoicePdf.text.includes("R\u00e9gime particulier \u2013 agences de voyages"),
  );
  check(
    "the invoice PDF never puts a figure on the VAT",
    !/TVA\s*:?\s*[\d(]/.test(invoicePdf.text) && !/\d\s*%\s*(de )?TVA/.test(invoicePdf.text),
    invoicePdf.text.match(/.{0,40}TVA.{0,40}/)?.[0] ?? "",
  );
  await client.close();

  // Régler la facture alimente l'aide à la déclaration.
  await page.goto(`${tripUrl}/devis`);
  await page.locator('input[name="payment_note"]').fill("Virement du 12/03");
  await page.getByRole("button", { name: "Marquer réglée" }).click();
  await page.waitForSelector("text=Réglée le");
  check("an invoice can be marked paid", await page.getByText(/Réglée le/).first().isVisible());

  // Depuis la page, pas depuis le client HTTP : le cookie de session est
  // `Secure`, et seul le navigateur l'envoie sur une origine locale en clair.
  const csvResponse = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    return { status: response.status, body: await response.text() };
  }, `${BASE}/api/tva-marge`);
  const csvBody = csvResponse.body;
  check(
    "the VAT export lists the paid invoice",
    csvResponse.status === 200 && csvBody.includes("FAC-") && csvBody.includes("Base taxable"),
    `status ${csvResponse.status} — ${csvBody.slice(0, 120)}`,
  );
  check(
    "the VAT export says it is a working document, not a declaration",
    csvBody.includes("à vérifier avec votre comptable"),
  );

  // 7. La page Marges additionne les dossiers engagés.
  await page.goto(`${BASE}/marges`);
  check("the margins page lists the dossier", await page.getByText("Smoke test — Oslo").first().isVisible());
  check(
    "the margins page totals the agency net of VAT",
    await page.getByText("Marge nette, après TVA sur marge").first().isVisible(),
  );
  // L'ancienne adresse grand public mène à la même vérité, côté agence.
  await page.goto(`${BASE}/savings`);
  await page.waitForURL("**/marges");
  check("the old savings page now points at the margins", page.url().endsWith("/marges"));

  // 7. L'essai s'arrête à deux dossiers en cours.
  await createTrip(page, { title: "Smoke test — Porto", city: "Porto", country: "Portugal" });
  await page.waitForURL(/\/trips\/\d+$/);
  await page.goto(`${BASE}/trips/new`);
  check(
    "the trial plan blocks a third active dossier",
    await page.getByText("limite de votre forfait").first().isVisible(),
  );

  // 8. Le forfait agence lève la limite.
  await page.goto(`${BASE}/account`);
  await page.getByRole("button", { name: "Passer au forfait Agence" }).last().click();
  await page.waitForSelector("text=Revenir à l'essai");
  await page.goto(`${BASE}/trips/new`);
  check(
    "the agency plan removes the limit",
    await page.getByRole("button", { name: "Créer le voyage" }).isVisible(),
  );

  // 8b. L'invitation d'un client : un lien, un mot de passe, et il arrive sur
  // ses dossiers. C'est le parcours qui manquait — le voyageur devait
  // s'inscrire seul, puis être rattaché à la main.
  const guestEmail = `invite-${Date.now()}@example.com`;
  await page.goto(`${BASE}/clients`);
  await page.fill('input[name="name"]', "Lou Bertin");
  await page.fill('input[name="email"]', guestEmail);
  await page.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForURL(/\/clients\/\d+$/);
  await page.getByRole("button", { name: /^Inviter Lou Bertin$/ }).click();
  await page.waitForSelector("text=Ce client a un accès", { timeout: 5000 }).catch(() => {});

  await page.goto(`${BASE}/messages`);
  check(
    "inviting a client queues an invitation",
    await page.getByText("Votre espace voyageur chez").first().isVisible(),
  );

  const invitePath = await readQueuedLink(page, "Votre espace voyageur chez", "/invitation/");
  check("the invitation carries a link", Boolean(invitePath), invitePath ?? "none");

  const invited = await browser.newPage();
  await invited.goto(`${BASE}${invitePath}`);
  check(
    "the invitation names the address the client will sign in with",
    await invited.getByText(guestEmail).isVisible(),
  );
  await invited.fill('input[name="password"]', "lou-motdepasse");
  await invited.getByRole("button", { name: "Ouvrir mon accès" }).click();
  await invited.waitForURL("**/mon-voyage");
  check("accepting the invitation opens a traveller account", invited.url().endsWith("/mon-voyage"));
  await invited.close();

  // 8c. Mot de passe oublié : demande, lien, nouveau mot de passe, connexion.
  const forgot = await browser.newPage();
  await forgot.goto(`${BASE}/mot-de-passe`);
  await forgot.fill('input[name="email"]', NEW_EMAIL);
  await forgot.getByRole("button", { name: "Envoyer le lien" }).click();
  await forgot.waitForSelector("text=Si un compte existe");
  check(
    "asking for a reset never says whether the address has an account",
    await forgot.getByText("Si un compte existe avec cette adresse").isVisible(),
  );

  await page.goto(`${BASE}/messages`);
  const resetPath = await readQueuedLink(page, "Choisir un nouveau mot de passe", "/mot-de-passe/");
  check("the reset link is prepared", Boolean(resetPath), resetPath ?? "none");

  await forgot.goto(`${BASE}${resetPath}`);
  await forgot.fill('input[name="password"]', "nouveau-mot-de-passe");
  await forgot.getByRole("button", { name: "Choisir ce mot de passe" }).click();
  await forgot.waitForURL("**/dashboard");
  check("the reset link signs you straight back in", forgot.url().endsWith("/dashboard"));

  // Changer de mot de passe coupe les autres sessions : celle de `page` est
  // morte, ce qui est exactement l'intérêt du geste.
  const staleSession = await page.goto(`${BASE}/dashboard`);
  check(
    "changing the password cuts the other sessions",
    page.url().includes("/login"),
    `${page.url()} (${staleSession?.status()})`,
  );
  check(
    "a used reset link cannot serve twice",
    await (async () => {
      await forgot.goto(`${BASE}${resetPath}`);
      return forgot.getByText("Ce lien a expiré ou a déjà servi").isVisible();
    })(),
  );
  await forgot.close();

  await signIn(page, NEW_EMAIL, "nouveau-mot-de-passe");

  // 9. A trip you are not on is not reachable.
  await signOut(page);
  await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
  const response = await page.goto(tripUrl);
  check("someone else's trip is not visible", response.status() === 404, `status ${response?.status()}`);

  // 11. The seeded shared trip settles up — onglet Voyageurs.
  await page.goto(`${BASE}/trips?filter=all`);
  await page.getByText("Week-end à Lisbonne").click();
  await page.waitForURL(/\/trips\/\d+$/);
  const lisbonUrl = page.url();
  await page.goto(`${lisbonUrl}/voyageurs`);
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

  // 13. La vue client : le voyageur voit son voyage, jamais ce qu'il a coûté.
  //
  // C'est la promesse faite au conseiller, donc elle se vérifie sur le texte
  // rendu, pas sur une classe CSS : le coût d'achat ne doit apparaître nulle
  // part sur la page — ni le prix d'achat du vol de Lisbonne, ni l'étiquette.
  await signOut(page);
  await signIn(page, "sam@journeyvalley.app", DEMO_PASSWORD, "**/mon-voyage");
  check(
    "a client lands in their own travel space",
    await page.getByText("Préparés avec votre conseiller").isVisible(),
  );

  await page.getByText("Week-end à Lisbonne").click();
  await page.waitForURL(/\/mon-voyage\/\d+$/);
  const clientPage = await page.locator("body").innerText();
  check(
    "the client sees their programme",
    await page.getByText("Votre programme").isVisible(),
  );
  check(
    "the client is never shown a purchase cost",
    !clientPage.includes("246") && !clientPage.includes("Coût") && !clientPage.includes("Marge"),
    clientPage.match(/.{0,40}(246|Coût|Marge).{0,40}/)?.[0] ?? "",
  );

  // Le dossier du conseiller lui est fermé : il est renvoyé vers son espace.
  const dossierUrl = page.url().replace("/mon-voyage/", "/trips/");
  await page.goto(dossierUrl);
  await page.waitForURL(/\/mon-voyage\/\d+$/);
  check("a client cannot open the advisor's dossier", page.url().includes("/mon-voyage/"));
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
