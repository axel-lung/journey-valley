"use server";

import { z } from "zod";
import { createSession, setPassword } from "@/lib/auth";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/db";
import { getDb } from "@/lib/db";
import { composeReset } from "@/lib/mail";
import { consumeToken, createAccessToken, publicUrl, queueAndDeliver, useableToken } from "@/lib/mail-store";
import type { User } from "@/lib/types";

/**
 * Le mot de passe oublié.
 *
 * Deux règles gouvernent ces deux actions :
 *
 * 1. **L'écran ne dit jamais si une adresse a un compte.** La réponse est la
 *    même dans les deux cas, et le temps passé aussi : sinon le formulaire
 *    devient un moyen de savoir qui est client.
 * 2. **Le lien sert une fois et expire vite.** Un lien de réinitialisation
 *    traîne dans une boîte mail bien plus longtemps qu'il ne devrait.
 */

const RESET_HOURS = 1;

export interface ResetState {
  error?: string;
  done?: boolean;
}

const requestSchema = z.object({
  email: z.string().trim().min(1, "Indiquez votre e-mail."),
});

export async function requestResetAction(
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez votre e-mail." };

  const user = getDb()
    .prepare<[string], User>(
      `SELECT id, email, name, plan, home_city, currency, role, agency_id, created_at
         FROM users WHERE email = ? COLLATE NOCASE`,
    )
    .get(parsed.data.email.trim().toLowerCase());

  if (user) {
    const token = createAccessToken({ kind: "reset", userId: user.id, hours: RESET_HOURS });
    const composed = composeReset({
      user: { name: user.name, email: user.email },
      url: publicUrl(`/mot-de-passe/${token}`),
      hours: RESET_HOURS,
    });

    await queueAndDeliver({
      agencyId: user.agency_id,
      kind: "reset",
      to: { name: user.name, email: user.email },
      subject: composed.subject,
      body: composed.body,
      link: publicUrl(`/mot-de-passe/${token}`),
      fromEmail: user.email,
    });

    recordActivity({ tripId: null, actorId: user.id, action: "password.reset_requested" });
  }

  // La même réponse dans les deux cas : ce formulaire ne doit pas révéler
  // quelles adresses ont un compte.
  return { done: true };
}

const setSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(8, "Au moins 8 caractères."),
});

export async function setPasswordAction(
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = setSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  const access = useableToken(parsed.data.token, "reset");
  if (!access?.user_id) {
    return { error: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau." };
  }

  setPassword(access.user_id, parsed.data.password);
  consumeToken(parsed.data.token);
  recordActivity({ tripId: null, actorId: access.user_id, action: "password.changed" });

  // `setPassword` a coupé toutes les sessions, y compris celles d'un intrus :
  // on en ouvre une neuve, celle de la personne qui vient de prouver l'accès.
  await createSession(access.user_id);
  redirect("/dashboard");
}
