"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdvisor, updateAgency } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import type { Plan } from "@/lib/types";

export interface AccountState {
  error?: string;
  saved?: boolean;
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Comment vous appelez-vous ?"),
  home_city: z.string().trim().max(80).default(""),
  currency: z.enum(["EUR", "USD", "GBP", "CHF"]),
});

export async function updateProfileAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vérifiez les informations et réessayez." };
  }

  getDb()
    .prepare(`UPDATE users SET name = ?, home_city = ?, currency = ? WHERE id = ?`)
    .run(parsed.data.name, parsed.data.home_city, parsed.data.currency, user.id);

  revalidatePath("/account");
  revalidatePath("/dashboard");
  return { saved: true };
}

/**
 * Switches the plan directly. A real deployment would hand off to a payment
 * provider here and only flip the plan once the webhook confirms it.
 */
export async function changePlanAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const plan = String(formData.get("plan"));
  if (plan !== "free" && plan !== "plus") return;

  getDb()
    .prepare(`UPDATE users SET plan = ? WHERE id = ?`)
    .run(plan as Plan, user.id);

  recordActivity({ tripId: null, actorId: user.id, action: "account.plan", detail: plan });

  revalidatePath("/account");
  revalidatePath("/dashboard");
}

/* ------------------------------------------------------------------ agence */

const agencySchema = z.object({
  name: z.string().trim().min(2, "Le nom de l'agence est un peu court."),
  legal_name: z.string().trim().max(160).default(""),
  registration: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.email("Cette adresse e-mail n'est pas valide.")]).default(""),
  phone: z.string().trim().max(30).default(""),
  financial_guarantee: z.string().trim().max(200).default(""),
  liability_insurance: z.string().trim().max(200).default(""),
  mediator: z.string().trim().max(200).default(""),
  target_margin_percent: z.coerce.number().int().min(0).max(90).default(15),
  vat_rate: z.coerce.number().int().min(0).max(30).default(20),
  vat_on_margin: z.literal("on").optional(),
  terms: z.string().trim().max(4000).default(""),
});

export interface AgencyFormState {
  error?: string;
  saved?: boolean;
}

/**
 * La fiche agence. Ce qui est saisi ici se retrouve sur chaque devis, donc la
 * validation est stricte sur la forme mais n'invente rien : une mention laissée
 * vide reste vide, et le devis dit qu'elle manque.
 */
export async function updateAgencyAction(
  _previous: AgencyFormState,
  formData: FormData,
): Promise<AgencyFormState> {
  const user = await requireUser();
  assertAdvisor(user);
  if (!user.agency_id) return { error: "Votre compte n'est rattaché à aucune agence." };

  const parsed = agencySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  const { vat_on_margin, ...fields } = parsed.data;
  updateAgency(user.agency_id, { ...fields, vat_on_margin: vat_on_margin === "on" ? 1 : 0 });

  revalidatePath("/account");
  revalidatePath("/dashboard");
  return { saved: true };
}
