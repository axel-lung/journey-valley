"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordActivity } from "@/lib/db";
import { decide, getQuoteByToken, isDecidable } from "@/lib/quotes";

/**
 * La réponse du client, depuis le lien public.
 *
 * Aucune session : c'est le jeton qui autorise, et il n'autorise que ce devis.
 * On revérifie ici que le devis est bien décidable — envoyé, pas encore
 * tranché, pas expiré — parce qu'un formulaire laissé ouvert dans un onglet ne
 * doit pas pouvoir accepter une offre périmée.
 */

export interface DecideState {
  error?: string;
}

const schema = z.object({
  token: z.string().trim().min(10),
  decision: z.enum(["accept", "decline"]),
  name: z.string().trim().min(2, "Indiquez votre nom."),
  note: z.string().trim().max(1000).default(""),
});

export async function decideQuoteAction(
  _previous: DecideState,
  formData: FormData,
): Promise<DecideState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vérifiez votre réponse." };
  }

  const found = getQuoteByToken(parsed.data.token);
  if (!found) return { error: "Ce devis n'existe pas ou n'est plus accessible." };
  if (!isDecidable(found.quote)) {
    return {
      error:
        "Ce devis n'est plus ouvert à une réponse : il a déjà été tranché, ou sa validité est passée.",
    };
  }

  // L'adresse est enregistrée comme trace de l'accord. On prend la première du
  // X-Forwarded-For, qui est celle du client derrière les relais.
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || null;

  const accepted = parsed.data.decision === "accept";
  decide({
    quoteId: found.quote.id,
    accepted,
    name: parsed.data.name,
    ip,
    note: parsed.data.note,
  });

  recordActivity({
    tripId: found.quote.trip_id,
    actorId: null,
    action: accepted ? "quote.accepted" : "quote.declined",
    detail: `${found.quote.reference} — ${parsed.data.name}`,
  });

  revalidatePath(`/devis/${parsed.data.token}`);
  revalidatePath(`/trips/${found.quote.trip_id}/devis`);
  return {};
}
