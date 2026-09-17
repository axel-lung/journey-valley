"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdvisor, createClient, getClient, updateClient } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/db";

/**
 * Les clients de l'agence.
 *
 * Chaque action revérifie deux choses avant d'écrire : que la personne est bien
 * un conseiller, et que le client visé appartient à son agence. Sans le second
 * contrôle, un identifiant deviné donnerait accès au fichier d'une autre
 * agence — c'est la faille classique de ce genre de produit.
 */

const clientSchema = z.object({
  name: z.string().trim().min(2, "Le nom du client est un peu court."),
  email: z.union([z.literal(""), z.email("Cette adresse e-mail n'est pas valide.")]).default(""),
  phone: z.string().trim().max(30).default(""),
  notes: z.string().trim().max(2000).default(""),
});

export interface ClientFormState {
  error?: string;
}

export async function createClientAction(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const user = await requireUser();
  assertAdvisor(user);
  if (!user.agency_id) return { error: "Votre compte n'est rattaché à aucune agence." };

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  const client = createClient({ agencyId: user.agency_id, ...parsed.data });
  recordActivity({
    tripId: null,
    actorId: user.id,
    action: "client.created",
    detail: client.name,
  });

  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClientAction(
  _previous: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const user = await requireUser();
  assertAdvisor(user);
  if (!user.agency_id) return { error: "Votre compte n'est rattaché à aucune agence." };

  const clientId = Number(formData.get("client_id"));
  if (!getClient(user.agency_id, clientId)) return { error: "Ce client n'existe pas." };

  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  updateClient(user.agency_id, clientId, parsed.data);
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return {};
}
