"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { deliver, getMessage } from "@/lib/mail-store";

/** Réessayer un envoi qui a échoué, une fois le réglage corrigé. */
export async function retryMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const message = getMessage(Number(formData.get("message_id")));
  if (!message || message.agency_id !== user.agency_id) redirect("/messages");

  await deliver(message.id, user.email);
  revalidatePath("/messages");
}
