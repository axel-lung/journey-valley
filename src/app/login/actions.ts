"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, createSession, EmailTakenError, registerUser } from "@/lib/auth";
import { recordActivity } from "@/lib/db";

export interface AuthState {
  error?: string;
}

const credentials = z.object({
  email: z.string().trim().min(1, "Indiquez votre e-mail."),
  password: z.string().min(1, "Indiquez votre mot de passe."),
});

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vérifiez vos informations et réessayez." };
  }

  const user = authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "Cet e-mail et ce mot de passe ne correspondent à aucun compte." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Comment vous appelez-vous ?"),
  email: z.email("Indiquez une adresse e-mail valide."),
  password: z.string().min(8, "Au moins 8 caractères."),
  home_city: z.string().trim().max(80).default(""),
  currency: z.enum(["EUR", "USD", "GBP", "CHF"]).default("EUR"),
});

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vérifiez vos informations et réessayez." };
  }

  let userId: number;
  try {
    const user = registerUser({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
      homeCity: parsed.data.home_city,
      currency: parsed.data.currency,
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return { error: "Un compte existe déjà avec cet e-mail — connectez-vous." };
    }
    throw error;
  }

  recordActivity({ tripId: null, actorId: userId, action: "account.created" });
  await createSession(userId);
  redirect("/dashboard");
}
