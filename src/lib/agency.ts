import { getDb } from "./db";
import { dossierMargin, purchasesComplete, totalMargin, type Margin } from "./margin";
import { costsByZone, vatOnMargin, type VatBreakdown, type VatZone } from "./vat";
import type { Agency, Client, ClientSummary, Trip, User } from "./types";

/**
 * L'agence et ses clients.
 *
 * Tout ce qui est ici est cloisonné par `agency_id` : une requête sans agence
 * ne renvoie rien. C'est la même règle que l'appartenance au dossier côté
 * voyageur — au niveau au-dessus.
 */

export function getAgency(agencyId: number | null): Agency | null {
  if (!agencyId) return null;
  return (
    getDb().prepare<[number], Agency>(`SELECT * FROM agencies WHERE id = ?`).get(agencyId) ?? null
  );
}

export function createAgency(input: { name: string; currency: string }): Agency {
  const result = getDb()
    .prepare(`INSERT INTO agencies (name, currency) VALUES (?, ?)`)
    .run(input.name.trim(), input.currency);

  return getAgency(Number(result.lastInsertRowid))!;
}

export type AgencyPatch = Partial<
  Pick<
    Agency,
    | "name"
    | "legal_name"
    | "registration"
    | "email"
    | "phone"
    | "website"
    | "brand_colour"
    | "target_margin_percent"
  >
>;

const PATCHABLE = [
  "name",
  "legal_name",
  "registration",
  "email",
  "phone",
  "website",
  "brand_colour",
  "target_margin_percent",
] as const;

export function updateAgency(agencyId: number, patch: AgencyPatch): void {
  // La liste blanche évite qu'une clé venue d'un formulaire touche une colonne
  // qui ne la regarde pas.
  const entries = PATCHABLE.filter((column) => patch[column] !== undefined).map(
    (column) => [column, patch[column]] as const,
  );
  if (entries.length === 0) return;

  getDb()
    .prepare(`UPDATE agencies SET ${entries.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`)
    .run(...entries.map(([, value]) => value as string | number), agencyId);
}

/* ---------------------------------------------------------------- clients */

export function getClient(agencyId: number, clientId: number): Client | null {
  return (
    getDb()
      .prepare<[number, number], Client>(`SELECT * FROM clients WHERE id = ? AND agency_id = ?`)
      .get(clientId, agencyId) ?? null
  );
}

export function createClient(input: {
  agencyId: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
}): Client {
  const result = getDb()
    .prepare(`INSERT INTO clients (agency_id, name, email, phone, notes) VALUES (?, ?, ?, ?, ?)`)
    .run(
      input.agencyId,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      input.phone.trim(),
      input.notes.trim(),
    );

  return getClient(input.agencyId, Number(result.lastInsertRowid))!;
}

export function updateClient(
  agencyId: number,
  clientId: number,
  patch: Pick<Client, "name" | "email" | "phone" | "notes">,
): void {
  getDb()
    .prepare(
      `UPDATE clients SET name = ?, email = ?, phone = ?, notes = ?
        WHERE id = ? AND agency_id = ?`,
    )
    .run(
      patch.name.trim(),
      patch.email.trim().toLowerCase(),
      patch.phone.trim(),
      patch.notes.trim(),
      clientId,
      agencyId,
    );
}

/**
 * La liste des clients, avec ce que chacun a rapporté.
 *
 * La marge est recalculée dossier par dossier plutôt qu'agrégée en SQL : un
 * forfait posé sur le dossier l'emporte sur la somme de ses lignes, et cette
 * règle vit dans `margin.ts`, pas en double dans une requête.
 */
export function listClients(agencyId: number, search = ""): ClientSummary[] {
  const db = getDb();
  const term = `%${search.trim()}%`;

  const clients = db
    .prepare<[number, string, string], Client>(
      `SELECT * FROM clients
        WHERE agency_id = ? AND (? = '%%' OR name LIKE ? COLLATE NOCASE)
        ORDER BY name COLLATE NOCASE`,
    )
    .all(agencyId, term, term);

  return clients.map((client) => {
    const files = listClientFiles(agencyId, client.id);
    const sold = files.filter((file) => file.counts_towards_revenue);

    return {
      ...client,
      trips: files.length,
      sold_cents: sold.reduce((total, file) => total + file.margin.sell_cents, 0),
      margin_cents: sold.reduce((total, file) => total + file.margin.margin_cents, 0),
      last_departure: files[0]?.trip.start_date ?? null,
    };
  });
}

export interface ClientFile {
  trip: Trip;
  margin: Margin & { partial: boolean };
  /** Ce qu'il reste après la TVA sur marge — le chiffre qui compte vraiment. */
  vat: VatBreakdown;
  /**
   * Seul un dossier réservé compte au chiffre : avant, les achats ne sont pas
   * tous saisis et la marge n'est qu'une prévision. Un devis en cours reste du
   * portefeuille, pas du résultat.
   */
  counts_towards_revenue: boolean;
}

/** Les dossiers d'un client, départ le plus proche en premier. */
export function listClientFiles(agencyId: number, clientId: number): ClientFile[] {
  const db = getDb();
  const trips = db
    .prepare<[number, number], Trip>(
      `SELECT t.* FROM trips t
         JOIN clients c ON c.id = t.client_id AND c.agency_id = ?
        WHERE t.client_id = ?
        ORDER BY t.start_date DESC`,
    )
    .all(agencyId, clientId);

  const agency = getAgency(agencyId);
  return trips.map((trip) => toFile(db, trip, agency));
}

/** Tous les dossiers de l'agence, pour le tableau de bord. */
export function listAgencyFiles(agencyId: number): ClientFile[] {
  const db = getDb();
  const trips = db
    .prepare<[number], Trip>(
      `SELECT t.* FROM trips t
         JOIN users u ON u.id = t.owner_id
        WHERE u.agency_id = ?
        ORDER BY t.start_date DESC`,
    )
    .all(agencyId);

  const agency = getAgency(agencyId);
  return trips.map((trip) => toFile(db, trip, agency));
}

function toFile(db: ReturnType<typeof getDb>, trip: Trip, agency: Agency | null): ClientFile {
  const bookings = db
    .prepare<[number], { amount_cents: number; agency_quote_cents: number; zone: VatZone }>(
      `SELECT amount_cents, agency_quote_cents, zone FROM bookings WHERE trip_id = ?`,
    )
    .all(trip.id);

  const margin = dossierMargin(trip, bookings);
  return {
    trip,
    margin,
    vat: vatOnMargin({
      marginGrossCents: margin.margin_cents,
      costs: costsByZone(bookings),
      ratePercent: agency?.vat_rate,
      subjectToVat: agency ? agency.vat_on_margin === 1 : true,
    }),
    counts_towards_revenue: purchasesComplete(trip.stage),
  };
}

export interface AgencyTotals extends Margin {
  files: number;
  vat_cents: number;
  /** Marge nette de TVA : ce que l'agence garde. */
  margin_net_cents: number;
}

/**
 * Le chiffre de l'agence sur les dossiers qui comptent.
 *
 * La TVA est additionnée dossier par dossier plutôt que recalculée sur le
 * total : chaque dossier a sa propre ventilation UE / hors UE, et une moyenne
 * effacerait précisément ce qui fait la différence.
 */
export function agencyTotals(files: ClientFile[]): AgencyTotals {
  const counted = files.filter((file) => file.counts_towards_revenue);
  const margin = totalMargin(counted.map((file) => file.margin));
  const vat = counted.reduce((total, file) => total + file.vat.vat_cents, 0);

  return {
    ...margin,
    files: counted.length,
    vat_cents: vat,
    margin_net_cents: margin.margin_cents - vat,
  };
}

/* ------------------------------------------------------------------ rôles */

/** Un conseiller voit les coûts et les marges ; un client, jamais. */
export function isAdvisor(user: Pick<User, "role">): boolean {
  return user.role !== "client";
}

/**
 * Le garde-fou, à appeler avant toute donnée financière interne.
 *
 * La règle tient en une ligne pour qu'il n'y ait qu'un endroit à relire quand
 * on se demande « est-ce que le client peut voir ça ? ».
 */
export function assertAdvisor(user: Pick<User, "role">): void {
  if (!isAdvisor(user)) throw new Error("FORBIDDEN");
}
