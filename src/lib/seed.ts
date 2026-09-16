import type Database from "better-sqlite3";
import { hashPassword } from "./password";

export const DEMO_PASSWORD = "journey2026";
export const DEMO_EMAIL = "camille@journeyvalley.app";

/**
 * Fills a fresh database with one household's travel history so the app is
 * usable the moment it boots. Runs only when there is no user yet, so
 * restarting the server never duplicates or overwrites real data.
 */
export function seedIfEmpty(db: Database.Database): void {
  const existing = db.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM users`).get();
  if (existing && existing.count > 0) return;

  const seed = db.transaction(() => {
    const password = hashPassword(DEMO_PASSWORD);
    const insertUser = db.prepare(
      `INSERT INTO users (email, name, password_hash, plan, home_city, currency)
       VALUES (?, ?, ?, ?, ?, 'EUR')`,
    );
    const addUser = (email: string, name: string, plan: string, city: string) =>
      Number(insertUser.run(email, name, password, plan, city).lastInsertRowid);

    const camille = addUser(DEMO_EMAIL, "Camille Dupont", "plus", "Lyon");
    const sam = addUser("sam@journeyvalley.app", "Sam Ortega", "free", "Lyon");
    const noor = addUser("noor@journeyvalley.app", "Noor Haddad", "free", "Marseille");
    const people = { camille, sam, noor };

    const insertTrip = db.prepare(
      `INSERT INTO trips (owner_id, title, summary, destination_city, destination_country,
                          start_date, end_date, stage, currency, budget_cents,
                          agency_quote_cents, travellers)
       VALUES (@owner, @title, @summary, @city, @country, @start, @end, @stage, 'EUR',
               @budget, @quote, @travellers)`,
    );
    const insertMember = db.prepare(
      `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, ?)`,
    );
    const insertBooking = db.prepare(
      `INSERT INTO bookings (trip_id, type, vendor, reference, description, start_at, end_at,
                             amount_cents, agency_quote_cents, nights, booked_by)
       VALUES (@trip, @type, @vendor, @reference, @description, @start_at, @end_at,
               @amount, @quote, @nights, @booked_by)`,
    );
    const insertExpense = db.prepare(
      `INSERT INTO expenses (trip_id, paid_by, category, description, spent_on, amount_cents,
                             shared, receipt_name)
       VALUES (@trip, @paid_by, @category, @description, @spent_on, @amount, @shared, @receipt)`,
    );
    const insertChecklist = db.prepare(
      `INSERT INTO checklist_items (trip_id, label, done, position) VALUES (?, ?, ?, ?)`,
    );
    const insertActivity = db.prepare(
      `INSERT INTO activity_log (trip_id, actor_id, action, detail, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const spec of demoTrips(day)) {
      const ownerId = people[spec.owner];
      const tripId = Number(
        insertTrip.run({
          owner: ownerId,
          title: spec.title,
          summary: spec.summary,
          city: spec.city,
          country: spec.country,
          start: spec.start,
          end: spec.end,
          stage: spec.stage,
          budget: spec.budget,
          quote: spec.agencyQuote ?? 0,
          travellers: 1 + (spec.companions?.length ?? 0),
        }).lastInsertRowid,
      );

      insertMember.run(tripId, ownerId, "owner");
      for (const companion of spec.companions ?? []) {
        insertMember.run(tripId, people[companion], "companion");
      }

      for (const booking of spec.bookings ?? []) {
        insertBooking.run({
          trip: tripId,
          type: booking.type,
          vendor: booking.vendor,
          reference: booking.reference ?? null,
          description: booking.description ?? "",
          start_at: booking.start_at,
          end_at: booking.end_at ?? null,
          amount: booking.amount_cents,
          quote: booking.agency_quote_cents ?? 0,
          nights: booking.nights ?? null,
          booked_by: ownerId,
        });
      }

      for (const expense of spec.expenses ?? []) {
        insertExpense.run({
          trip: tripId,
          paid_by: people[expense.paid_by],
          category: expense.category,
          description: expense.description,
          spent_on: expense.spent_on,
          amount: expense.amount_cents,
          shared: expense.shared === false ? 0 : 1,
          receipt: expense.receipt_name ?? null,
        });
      }

      (spec.checklist ?? []).forEach((item, index) => {
        insertChecklist.run(tripId, item.label, item.done ? 1 : 0, index);
      });

      insertActivity.run(tripId, ownerId, `trip.${spec.stage}`, spec.title, day(-15));
    }
  });

  seed();
}

/** ISO date `offset` days from today (negative = past). */
function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

type Person = "camille" | "sam" | "noor";

interface DemoBooking {
  type: "flight" | "stay" | "activity" | "transport" | "other";
  vendor: string;
  reference?: string;
  description?: string;
  start_at: string;
  end_at?: string;
  amount_cents: number;
  agency_quote_cents?: number;
  nights?: number;
}

interface DemoExpense {
  paid_by: Person;
  category: "food" | "transport" | "lodging" | "activities" | "shopping" | "other";
  description: string;
  spent_on: string;
  amount_cents: number;
  shared?: boolean;
  receipt_name?: string;
}

interface DemoChecklistItem {
  label: string;
  done?: boolean;
}

interface DemoTrip {
  owner: Person;
  checklist?: DemoChecklistItem[];
  companions?: Person[];
  title: string;
  summary: string;
  city: string;
  country: string;
  start: string;
  end: string;
  stage: "idea" | "planning" | "booked" | "travelling" | "completed" | "cancelled";
  budget: number;
  agencyQuote?: number;
  bookings?: DemoBooking[];
  expenses?: DemoExpense[];
}

function demoTrips(d: (offset: number) => string): DemoTrip[] {
  return [
    {
      owner: "camille",
      companions: ["sam"],
      title: "Week-end à Lisbonne",
      summary: "Quatre jours de pastéis, d'azulejos et le tram jusqu'à Graça.",
      city: "Lisbonne",
      country: "Portugal",
      start: d(-96),
      end: d(-92),
      stage: "completed",
      budget: 90_000,
      bookings: [
        {
          type: "flight",
          vendor: "TAP",
          reference: "TP1043",
          description: "LYS → LIS aller-retour, deux places",
          start_at: d(-96),
          end_at: d(-92),
          amount_cents: 24_600,
          agency_quote_cents: 38_000,
        },
        {
          type: "stay",
          vendor: "Alfama apartment",
          description: "4 nuits, appartement entier",
          start_at: d(-96),
          end_at: d(-92),
          amount_cents: 32_800,
          agency_quote_cents: 52_000,
          nights: 4,
        },
        {
          type: "activity",
          vendor: "Visite gourmande du Time Out Market",
          start_at: d(-94),
          amount_cents: 9_000,
          agency_quote_cents: 13_000,
        },
      ],
      expenses: [
        { paid_by: "camille", category: "food", description: "Dîner au Bairro Alto", spent_on: d(-95), amount_cents: 6_400, receipt_name: "bairro-alto.jpg" },
        { paid_by: "sam", category: "transport", description: "Forfaits tram", spent_on: d(-95), amount_cents: 2_400 },
        { paid_by: "sam", category: "food", description: "Pastéis de Belém", spent_on: d(-94), amount_cents: 1_150 },
        { paid_by: "camille", category: "shopping", description: "Azulejos pour la cuisine", spent_on: d(-93), amount_cents: 4_800, shared: false },
      ],
    },
    {
      owner: "camille",
      companions: ["sam", "noor"],
      title: "Road trip dans les fjords norvégiens",
      summary: "Bergen → Ålesund en voiture de location, cinq étapes, sans car de tourisme.",
      city: "Bergen",
      country: "Norvège",
      checklist: [
        { label: "Permis de conduire international", done: true },
        { label: "Réserver le ferry de Geiranger", done: true },
        { label: "Chaînes neige : vérifier si incluses", done: false },
        { label: "Télécharger les cartes hors-ligne", done: false },
        { label: "Prévoir une multiprise adaptateur", done: false },
      ],
      start: d(26),
      end: d(35),
      stage: "booked",
      budget: 210_000,
      // The package holiday the same itinerary was quoted at.
      agencyQuote: 289_000,
      bookings: [
        {
          type: "flight",
          vendor: "Norwegian",
          reference: "DY1451",
          description: "LYS → BGO aller-retour, trois places",
          start_at: d(26),
          end_at: d(35),
          amount_cents: 62_400,
        },
        {
          type: "transport",
          vendor: "Hertz",
          description: "Break, 9 jours, kilométrage illimité",
          start_at: d(26),
          end_at: d(35),
          amount_cents: 47_800,
        },
        {
          type: "stay",
          vendor: "Chalets des fjords (4 étapes)",
          description: "9 nuits entre Bergen, Flåm, Geiranger et Ålesund",
          start_at: d(26),
          end_at: d(35),
          amount_cents: 78_500,
          nights: 9,
        },
        {
          type: "activity",
          vendor: "Ferry du Nærøyfjord",
          start_at: d(29),
          amount_cents: 11_400,
        },
      ],
      expenses: [
        { paid_by: "camille", category: "other", description: "Assurance voyage, trois personnes", spent_on: d(-4), amount_cents: 8_700 },
      ],
    },
    {
      owner: "sam",
      companions: ["camille"],
      title: "Kyoto en automne",
      summary: "Deux semaines à courir après les érables, Rail Pass plutôt qu'un circuit organisé.",
      city: "Kyoto",
      country: "Japon",
      checklist: [
        { label: "Commander le Japan Rail Pass", done: false },
        { label: "Vérifier la validité du passeport", done: true },
        { label: "Assurance santé à l'étranger", done: false },
      ],
      start: d(112),
      end: d(126),
      stage: "planning",
      budget: 340_000,
      agencyQuote: 452_000,
      bookings: [
        {
          type: "flight",
          vendor: "ANA",
          description: "CDG → KIX aller-retour, deux places",
          start_at: d(112),
          end_at: d(126),
          amount_cents: 148_000,
          agency_quote_cents: 186_000,
        },
      ],
    },
    {
      owner: "noor",
      companions: ["camille"],
      title: "L'Andalousie en train",
      summary: "Séville, Cordoue, Grenade — que du train, aucun avion.",
      city: "Séville",
      country: "Espagne",
      start: d(160),
      end: d(168),
      stage: "idea",
      budget: 120_000,
    },
    {
      owner: "camille",
      title: "Une semaine de rando dans les Dolomites",
      summary: "Alta Via 1, refuges réservés un par un plutôt qu'un séjour guidé.",
      city: "Cortina d'Ampezzo",
      country: "Italie",
      start: d(-320),
      end: d(-313),
      stage: "completed",
      budget: 95_000,
      agencyQuote: 148_000,
      bookings: [
        {
          type: "transport",
          vendor: "Flixbus + trains régionaux",
          start_at: d(-320),
          end_at: d(-313),
          amount_cents: 14_200,
        },
        {
          type: "stay",
          vendor: "Refuges en demi-pension (6 étapes)",
          description: "7 nuits, dîner et petit-déjeuner compris",
          start_at: d(-320),
          end_at: d(-313),
          amount_cents: 61_600,
          nights: 7,
        },
      ],
      expenses: [
        { paid_by: "camille", category: "food", description: "Déjeuners sur les sentiers", spent_on: d(-317), amount_cents: 5_200 },
        { paid_by: "camille", category: "activities", description: "Téléphérique à la descente du Lagazuoi", spent_on: d(-314), amount_cents: 2_100 },
      ],
    },
  ];
}
