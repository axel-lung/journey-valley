"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import type { Plan } from "@/lib/types";

export interface AccountState {
  error?: string;
  saved?: boolean;
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "What should we call you?"),
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
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
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
