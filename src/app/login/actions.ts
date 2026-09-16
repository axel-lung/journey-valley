"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticate, createSession, EmailTakenError, registerUser } from "@/lib/auth";
import { recordActivity } from "@/lib/db";

export interface AuthState {
  error?: string;
}

const credentials = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const user = authenticate(parsed.data.email, parsed.data.password);
  if (!user) {
    return { error: "That email and password combination does not match an account." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "What should we call you?"),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  home_city: z.string().trim().max(80).default(""),
  currency: z.enum(["EUR", "USD", "GBP", "CHF"]).default("EUR"),
});

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
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
      return { error: "That email already has an account — sign in instead." };
    }
    throw error;
  }

  recordActivity({ tripId: null, actorId: userId, action: "account.created" });
  await createSession(userId);
  redirect("/dashboard");
}
