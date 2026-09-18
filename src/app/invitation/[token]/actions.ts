"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, EmailTakenError, registerUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import { consumeToken, useableToken } from "@/lib/mail-store";
import type { Client } from "@/lib/types";

/**
 * Le client accepte son invitation.
 *
 * Ce qui se passe ici décide de ce qu'il verra : un compte de rôle `client`,
 * rattaché à sa fiche, et inscrit sur les dossiers que l'agence a déjà ouverts
 * à son nom. Sans cette dernière étape, il se connecterait sur un espace vide
 * — et ne reviendrait pas.
 */

export interface InviteState {
  error?: string;
}

const schema = z.object({
  token: z.string().trim().min(1),
  name: z.string().trim().min(2, "Comment vous appelez-vous ?"),
  password: z.string().min(8, "Au moins 8 caractères."),
});

export async function acceptInviteAction(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  const access = useableToken(parsed.data.token, "invite");
  if (!access?.client_id) {
    return { error: "Cette invitation a expiré ou a déjà servi. Demandez-en une nouvelle." };
  }

  const db = getDb();
  const client = db
    .prepare<[number], Client>(`SELECT * FROM clients WHERE id = ?`)
    .get(access.client_id);
  if (!client?.email) return { error: "Cette invitation n'est plus valable." };
  if (client.user_id) return { error: "Cet accès a déjà été ouvert : connectez-vous." };

  let userId: number;
  try {
    const user = registerUser({
      email: client.email,
      name: parsed.data.name,
      password: parsed.data.password,
      homeCity: "",
      currency: "EUR",
      role: "client",
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { error: "Un compte existe déjà avec cette adresse — connectez-vous." };
    }
    throw error;
  }

  db.transaction(() => {
    db.prepare(`UPDATE clients SET user_id = ? WHERE id = ?`).run(userId, client.id);

    // Les dossiers déjà ouverts à son nom : il doit les trouver en arrivant.
    const trips = db
      .prepare<[number], { id: number }>(`SELECT id FROM trips WHERE client_id = ?`)
      .all(client.id);
    const join = db.prepare(
      `INSERT OR IGNORE INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'companion')`,
    );
    for (const trip of trips) join.run(trip.id, userId);
  })();

  consumeToken(parsed.data.token);
  recordActivity({ tripId: null, actorId: userId, action: "client.accepted_invite" });

  await createSession(userId);
  redirect("/mon-voyage");
}
