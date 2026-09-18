"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdvisor } from "@/lib/agency";
import {
  deleteAttachment,
  getAttachment,
  setVisibility,
  storeAttachment,
} from "@/lib/attachments-store";
import { DEFAULT_VISIBILITY, isVisibility } from "@/lib/attachments";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/db";
import { membershipRole } from "@/lib/trips";

/**
 * Les pièces du dossier.
 *
 * Seul un conseiller en dépose : c'est l'agence qui remet des documents, pas
 * l'inverse — le téléphone lit, il n'écrit pas. Chaque action revérifie
 * l'appartenance au dossier avant d'écrire.
 */

export interface AttachmentState {
  error?: string;
}

export async function uploadAttachmentAction(
  _previous: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const user = await requireUser();
  if (!isAdvisor(user)) return { error: "Seul un conseiller peut déposer une pièce." };

  const tripId = Number(formData.get("trip_id"));
  if (!membershipRole(user.id, tripId)) return { error: "Ce dossier ne vous appartient pas." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier." };

  const raw = String(formData.get("visibility") ?? "");
  const visibility = isVisibility(raw) ? raw : DEFAULT_VISIBILITY;

  const result = await storeAttachment({
    tripId,
    uploadedBy: user.id,
    file,
    visibility,
  });
  if (result.error) return { error: result.error };

  recordActivity({
    tripId,
    actorId: user.id,
    action: "attachment.added",
    detail: result.attachment?.name,
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/mon-voyage/${tripId}`);
  return {};
}

export async function setAttachmentVisibilityAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const attachment = getAttachment(Number(formData.get("attachment_id")));
  if (!attachment || !membershipRole(user.id, attachment.trip_id)) redirect("/trips");

  const raw = String(formData.get("visibility") ?? "");
  if (isVisibility(raw)) setVisibility(attachment.id, raw);

  revalidatePath(`/trips/${attachment.trip_id}`);
  revalidatePath(`/mon-voyage/${attachment.trip_id}`);
}

export async function deleteAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const attachment = getAttachment(Number(formData.get("attachment_id")));
  if (!attachment || !membershipRole(user.id, attachment.trip_id)) redirect("/trips");

  deleteAttachment(attachment);
  recordActivity({
    tripId: attachment.trip_id,
    actorId: user.id,
    action: "attachment.removed",
    detail: attachment.name,
  });

  revalidatePath(`/trips/${attachment.trip_id}`);
  revalidatePath(`/mon-voyage/${attachment.trip_id}`);
}
