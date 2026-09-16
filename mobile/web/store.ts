/**
 * Offline store for the Android build.
 *
 * The phone app has no server and no accounts: one device, one traveller, and
 * companions are names you type rather than people with logins. Everything
 * lives in a single JSON document, written through the Android bridge when it
 * is there and to localStorage otherwise (so the same bundle runs in a desktop
 * browser during development).
 *
 * The shapes deliberately match the web app's row types, so `budget.ts` and
 * `stages.ts` are shared between the two builds without adapters.
 */
import type {
  Booking,
  BookingType,
  Expense,
  ExpenseCategory,
  Trip,
  TripStage,
} from "../../src/lib/types";

export interface LocalTraveller {
  trip_id: number;
  user_id: number;
  name: string;
  /** The device owner, who cannot be removed from their own trip. */
  is_me: number;
}

export interface Database {
  version: 1;
  next_id: number;
  trips: Trip[];
  travellers: LocalTraveller[];
  bookings: Booking[];
  expenses: Expense[];
}

declare global {
  interface Window {
    /** Injected by the Android shell; absent in a desktop browser. */
    JVStore?: { load(): string; save(json: string): void };
    /** Registered by the app so the shell's back button can step back. */
    JVBack?: () => boolean;
  }
}

const STORAGE_KEY = "journey-valley/v1";

function readRaw(): string | null {
  try {
    if (window.JVStore) return window.JVStore.load() || null;
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(json: string): void {
  try {
    if (window.JVStore) {
      window.JVStore.save(json);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // A full or blocked store must not take the screen down; the session keeps
    // working in memory and the next write can succeed.
  }
}

let db: Database = load();

function load(): Database {
  const raw = readRaw();
  if (!raw) return seed();
  try {
    const parsed = JSON.parse(raw) as Database;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.trips)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function persist(): void {
  writeRaw(JSON.stringify(db));
}

export function getDb(): Database {
  return db;
}

export function resetToDemo(): void {
  db = seed();
  persist();
}

export function clearAll(): void {
  db = { version: 1, next_id: 1, trips: [], travellers: [], bookings: [], expenses: [] };
  persist();
}

function id(): number {
  return db.next_id++;
}

export const CURRENCY = "EUR" as const;

/* ------------------------------------------------------------------ reads */

export function listTrips(): Trip[] {
  return [...db.trips].sort((a, b) => b.start_date.localeCompare(a.start_date));
}

export function getTrip(tripId: number): Trip | null {
  return db.trips.find((trip) => trip.id === tripId) ?? null;
}

export function listTravellers(tripId: number): LocalTraveller[] {
  return db.travellers
    .filter((traveller) => traveller.trip_id === tripId)
    .sort((a, b) => b.is_me - a.is_me || a.user_id - b.user_id);
}

export function listBookings(tripId: number): Booking[] {
  return db.bookings
    .filter((booking) => booking.trip_id === tripId)
    .sort((a, b) => a.start_at.localeCompare(b.start_at) || a.id - b.id);
}

export function listExpenses(tripId: number): Expense[] {
  return db.expenses
    .filter((expense) => expense.trip_id === tripId)
    .sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.id - a.id);
}

/* ----------------------------------------------------------------- writes */

export interface NewTripInput {
  title: string;
  summary: string;
  destination_city: string;
  destination_country: string;
  start_date: string;
  end_date: string;
  budget_cents: number;
  agency_quote_cents: number;
}

export function createTrip(input: NewTripInput): Trip {
  const trip: Trip = {
    id: id(),
    owner_id: 1,
    title: input.title,
    summary: input.summary,
    destination_city: input.destination_city,
    destination_country: input.destination_country,
    start_date: input.start_date,
    end_date: input.end_date,
    stage: "idea",
    currency: CURRENCY,
    budget_cents: input.budget_cents,
    agency_quote_cents: input.agency_quote_cents,
    travellers: 1,
    created_at: today(),
  };
  db.trips.push(trip);
  db.travellers.push({ trip_id: trip.id, user_id: id(), name: "Me", is_me: 1 });
  persist();
  return trip;
}

export function updateTrip(tripId: number, patch: Partial<Trip>): void {
  const trip = getTrip(tripId);
  if (!trip) return;
  Object.assign(trip, patch);
  persist();
}

export function setStage(tripId: number, stage: TripStage): void {
  updateTrip(tripId, { stage });
}

export function deleteTrip(tripId: number): void {
  db.trips = db.trips.filter((trip) => trip.id !== tripId);
  db.travellers = db.travellers.filter((traveller) => traveller.trip_id !== tripId);
  db.bookings = db.bookings.filter((booking) => booking.trip_id !== tripId);
  db.expenses = db.expenses.filter((expense) => expense.trip_id !== tripId);
  persist();
}

export function addTraveller(tripId: number, name: string): void {
  const trip = getTrip(tripId);
  if (!trip) return;
  db.travellers.push({ trip_id: tripId, user_id: id(), name, is_me: 0 });
  trip.travellers = listTravellers(tripId).length;
  persist();
}

export function removeTraveller(tripId: number, userId: number): void {
  const traveller = db.travellers.find(
    (entry) => entry.trip_id === tripId && entry.user_id === userId,
  );
  if (!traveller || traveller.is_me) return;

  db.travellers = db.travellers.filter(
    (entry) => !(entry.trip_id === tripId && entry.user_id === userId),
  );
  // Expenses they paid would otherwise leave the split unbalanced.
  db.expenses = db.expenses.filter(
    (expense) => !(expense.trip_id === tripId && expense.paid_by === userId),
  );

  const trip = getTrip(tripId);
  if (trip) trip.travellers = Math.max(1, listTravellers(tripId).length);
  persist();
}

export interface NewBookingInput {
  trip_id: number;
  type: BookingType;
  vendor: string;
  description: string;
  start_at: string;
  end_at: string | null;
  amount_cents: number;
  agency_quote_cents: number;
  nights: number | null;
}

export function addBooking(input: NewBookingInput): void {
  db.bookings.push({
    id: id(),
    trip_id: input.trip_id,
    type: input.type,
    vendor: input.vendor,
    reference: null,
    description: input.description,
    start_at: input.start_at,
    end_at: input.end_at,
    amount_cents: input.amount_cents,
    agency_quote_cents: input.agency_quote_cents,
    nights: input.nights,
    booked_by: null,
    created_at: today(),
  });
  persist();
}

export function deleteBooking(bookingId: number): void {
  db.bookings = db.bookings.filter((booking) => booking.id !== bookingId);
  persist();
}

export interface NewExpenseInput {
  trip_id: number;
  paid_by: number;
  category: ExpenseCategory;
  description: string;
  spent_on: string;
  amount_cents: number;
  shared: boolean;
}

export function addExpense(input: NewExpenseInput): void {
  db.expenses.push({
    id: id(),
    trip_id: input.trip_id,
    paid_by: input.paid_by,
    category: input.category,
    description: input.description,
    spent_on: input.spent_on,
    amount_cents: input.amount_cents,
    shared: input.shared ? 1 : 0,
    receipt_name: null,
    created_at: today(),
  });
  persist();
}

export function deleteExpense(expenseId: number): void {
  db.expenses = db.expenses.filter((expense) => expense.id !== expenseId);
  persist();
}

/* ------------------------------------------------------------------- seed */

export function today(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** The same three trips as the web demo, so the app opens with something real. */
function seed(): Database {
  const fresh: Database = {
    version: 1,
    next_id: 1,
    trips: [],
    travellers: [],
    bookings: [],
    expenses: [],
  };
  db = fresh;

  const lisbon = createTrip({
    title: "Lisbon long weekend",
    summary: "Four days of pastéis, tiles and the tram up to Graça.",
    destination_city: "Lisbon",
    destination_country: "Portugal",
    start_date: today(-96),
    end_date: today(-92),
    budget_cents: 90_000,
    agency_quote_cents: 0,
  });
  setStage(lisbon.id, "completed");
  addTraveller(lisbon.id, "Sam");
  const [me, sam] = listTravellers(lisbon.id);
  addBooking({
    trip_id: lisbon.id,
    type: "flight",
    vendor: "TAP",
    description: "LYS → LIS return, two seats",
    start_at: today(-96),
    end_at: today(-92),
    amount_cents: 24_600,
    agency_quote_cents: 38_000,
    nights: null,
  });
  addBooking({
    trip_id: lisbon.id,
    type: "stay",
    vendor: "Alfama apartment",
    description: "4 nights, whole flat",
    start_at: today(-96),
    end_at: today(-92),
    amount_cents: 32_800,
    agency_quote_cents: 52_000,
    nights: 4,
  });
  addExpense({
    trip_id: lisbon.id,
    paid_by: me.user_id,
    category: "food",
    description: "Dinner in Bairro Alto",
    spent_on: today(-95),
    amount_cents: 6_400,
    shared: true,
  });
  addExpense({
    trip_id: lisbon.id,
    paid_by: sam.user_id,
    category: "transport",
    description: "Tram passes",
    spent_on: today(-95),
    amount_cents: 2_400,
    shared: true,
  });
  addExpense({
    trip_id: lisbon.id,
    paid_by: me.user_id,
    category: "shopping",
    description: "Tiles for the kitchen",
    spent_on: today(-93),
    amount_cents: 4_800,
    shared: false,
  });

  const norway = createTrip({
    title: "Norway fjords road trip",
    summary: "Bergen to Ålesund by hire car, five stops, no tour bus.",
    destination_city: "Bergen",
    destination_country: "Norway",
    start_date: today(26),
    end_date: today(35),
    budget_cents: 210_000,
    agency_quote_cents: 289_000,
  });
  setStage(norway.id, "booked");
  addTraveller(norway.id, "Sam");
  addTraveller(norway.id, "Noor");
  addBooking({
    trip_id: norway.id,
    type: "flight",
    vendor: "Norwegian",
    description: "LYS → BGO return, three seats",
    start_at: today(26),
    end_at: today(35),
    amount_cents: 62_400,
    agency_quote_cents: 0,
    nights: null,
  });
  addBooking({
    trip_id: norway.id,
    type: "transport",
    vendor: "Hertz",
    description: "Estate car, 9 days",
    start_at: today(26),
    end_at: today(35),
    amount_cents: 47_800,
    agency_quote_cents: 0,
    nights: null,
  });
  addBooking({
    trip_id: norway.id,
    type: "stay",
    vendor: "Fjord cabins",
    description: "9 nights across four stops",
    start_at: today(26),
    end_at: today(35),
    amount_cents: 78_500,
    agency_quote_cents: 0,
    nights: 9,
  });
  const norwayTravellers = listTravellers(norway.id);
  addExpense({
    trip_id: norway.id,
    paid_by: norwayTravellers[0].user_id,
    category: "other",
    description: "Travel insurance, three people",
    spent_on: today(-4),
    amount_cents: 8_700,
    shared: true,
  });

  const kyoto = createTrip({
    title: "Kyoto in autumn",
    summary: "Two weeks chasing the maple season, rail pass instead of a tour.",
    destination_city: "Kyoto",
    destination_country: "Japan",
    start_date: today(112),
    end_date: today(126),
    budget_cents: 340_000,
    agency_quote_cents: 0,
  });
  setStage(kyoto.id, "planning");
  addTraveller(kyoto.id, "Sam");
  addBooking({
    trip_id: kyoto.id,
    type: "flight",
    vendor: "ANA",
    description: "CDG → KIX return, two seats",
    start_at: today(112),
    end_at: today(126),
    amount_cents: 148_000,
    agency_quote_cents: 186_000,
    nights: null,
  });

  persist();
  return db;
}
