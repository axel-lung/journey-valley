"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdvisor, getClient } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import { canCreateTrip } from "@/lib/plans";
import { countActiveTrips } from "@/lib/trips";
import { coverage, parseProgramme, type ExtractedProgramme } from "@/lib/import/parse";
import { extractText, looksEmpty } from "@/lib/import/text";

/**
 * L'import d'un programme déjà écrit.
 *
 * Deux temps, et c'est volontaire :
 *
 * 1. **lire** — le fichier ou le texte collé devient une structure, qu'on
 *    montre telle quelle, avec ce qui a été deviné et ce qui n'a pas été
 *    rattaché ;
 * 2. **créer** — le conseiller corrige ce qu'il faut, décoche ce qui est du
 *    bruit, et le dossier naît de ce qu'il a validé.
 *
 * Rien n'est écrit en base entre les deux : l'extraction vit dans l'état du
 * formulaire. Une lecture ratée ne laisse donc aucune trace à nettoyer, ce qui
 * compte quand on ne sait pas encore si l'extraction est bonne.
 */

export interface ImportState {
  error?: string;
  programme?: ExtractedProgramme;
  /** Ce que le conseiller a déposé, pour qu'il puisse le relire et le corriger. */
  source?: string;
  coverage?: { matched: number; total: number; percent: number };
}

const MAX_BYTES = 8 * 1024 * 1024;

/** Premier temps : lire ce qui a été déposé. */
export async function readProgrammeAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();
  assertAdvisor(user);

  const pasted = String(formData.get("pasted") ?? "").trim();
  const file = formData.get("file");

  let text = pasted;
  if (!text && file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: "Ce fichier dépasse 8 Mo." };
    const read = extractText({
      fileName: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    text = read.text;

    if (looksEmpty(text)) {
      return {
        error:
          read.kind === "pdf"
            ? "Ce PDF ne contient pas de texte lisible — c'est souvent le cas d'un document scanné. Collez plutôt le programme ci-dessous."
            : "Ce fichier n'a pas livré de texte. Collez plutôt le programme ci-dessous.",
        source: "",
      };
    }
  }

  if (!text) return { error: "Déposez un fichier, ou collez votre programme." };

  const programme = parseProgramme(text);
  return { programme, source: text, coverage: coverage(programme) };
}

/* -------------------------------------------------------------- création */

const entrySchema = z.object({
  kind: z.enum(["flight", "stay", "transport", "activity", "other"]),
  label: z.string().trim().min(1).max(300),
  date: z.string().trim().max(10),
  reference: z.string().trim().max(60).default(""),
  nights: z.coerce.number().int().min(0).max(60).default(0),
});

const createSchema = z.object({
  title: z.string().trim().min(2, "Donnez un titre au dossier."),
  destination_city: z.string().trim().max(80).default(""),
  destination_country: z.string().trim().max(80).default(""),
  start_date: z.string().trim().min(1, "Indiquez une date de départ."),
  end_date: z.string().trim().min(1, "Indiquez une date de retour."),
  travellers: z.coerce.number().int().min(1).max(40).default(1),
  client_id: z.string().trim().default(""),
  /** Les prestations retenues, telles que l'écran les a montrées. */
  entries: z.string().default("[]"),
});

/**
 * Second temps : créer le dossier à partir de ce qui a été validé.
 *
 * Les prestations arrivent sans montant, et c'est normal : un programme décrit
 * le voyage, pas ce qu'il a coûté. Le dossier naît donc avec des lignes à
 * zéro, que `margin.ts` compte déjà comme non chiffrées — l'écran dira que la
 * marge n'est pas ferme, ce qui est exactement vrai.
 */
export async function createFromImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const user = await requireUser();
  assertAdvisor(user);

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  }

  const allowed = canCreateTrip(user.plan, countActiveTrips(user.id));
  if (!allowed.allowed) return { error: allowed.reason };

  let entries: Array<z.infer<typeof entrySchema>>;
  try {
    entries = z.array(entrySchema).max(300).parse(JSON.parse(parsed.data.entries));
  } catch {
    return { error: "Les prestations retenues n'ont pas pu être relues." };
  }

  const clientId = Number(parsed.data.client_id) || null;
  const client = clientId && user.agency_id ? getClient(user.agency_id, clientId) : null;

  const db = getDb();
  const tripId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO trips (owner_id, client_id, title, summary, destination_city,
                            destination_country, start_date, end_date, stage, currency,
                            budget_cents, agency_quote_cents, travellers)
         VALUES (?, ?, ?, '', ?, ?, ?, ?, 'idea', ?, 0, 0, ?)`,
      )
      .run(
        user.id,
        client?.id ?? null,
        parsed.data.title,
        parsed.data.destination_city,
        parsed.data.destination_country,
        parsed.data.start_date,
        parsed.data.end_date,
        user.currency,
        parsed.data.travellers,
      );

    const id = Number(result.lastInsertRowid);
    db.prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`).run(
      id,
      user.id,
    );

    const insert = db.prepare(
      `INSERT INTO bookings (trip_id, type, vendor, reference, description, start_at,
                             amount_cents, agency_quote_cents, zone, nights, booked_by)
       VALUES (?, ?, ?, ?, '', ?, 0, 0, 'eu', ?, ?)`,
    );
    for (const entry of entries) {
      insert.run(
        id,
        entry.kind,
        entry.label.slice(0, 120),
        entry.reference || null,
        entry.date || parsed.data.start_date,
        entry.nights || null,
        user.id,
      );
    }

    return id;
  })();

  recordActivity({
    tripId,
    actorId: user.id,
    action: "trip.imported",
    detail: `${entries.length} prestations`,
  });

  revalidatePath("/trips");
  revalidatePath("/dashboard");
  redirect(`/trips/${tripId}`);
}
