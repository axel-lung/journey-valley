import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { getDb } from "./db";
import {
  canSee,
  checkUpload,
  DEFAULT_VISIBILITY,
  extensionOf,
  safeName,
  type Visibility,
} from "./attachments";

/**
 * Les pièces sur le disque.
 *
 * Deux décisions tiennent la sécurité de ce fichier :
 *
 * 1. **Le nom d'origine n'est jamais un chemin.** Le fichier est écrit sous un
 *    identifiant aléatoire choisi ici ; le nom que l'utilisateur a donné ne
 *    sert qu'à l'affichage et à l'en-tête de téléchargement. Aucune chaîne
 *    venue d'un formulaire n'atteint le système de fichiers.
 * 2. **On ne sert jamais un fichier sans revérifier l'appartenance.** La
 *    lecture passe par `readableAttachment`, qui exige le dossier *et* le rôle
 *    — un identifiant deviné ne rend rien, et un voyageur ne reçoit que ce qui
 *    lui a été remis.
 *
 * Les octets vivent à côté de la base, dans `uploads/`, pour qu'une sauvegarde
 * du volume emporte les deux.
 */

const DEFAULT_DB_PATH = "./data/journey-valley.db";

function uploadRoot(): string {
  const configured = process.env.JV_UPLOAD_PATH;
  if (configured) return resolve(configured);
  return join(dirname(resolve(process.env.DATABASE_PATH ?? DEFAULT_DB_PATH)), "uploads");
}

export interface Attachment {
  id: number;
  trip_id: number;
  uploaded_by: number | null;
  name: string;
  stored_name: string;
  content_type: string;
  size_bytes: number;
  visibility: Visibility;
  created_at: string;
}

export interface StoreResult {
  attachment?: Attachment;
  error?: string;
}

/**
 * Enregistre une pièce.
 *
 * Le fichier est écrit avant la ligne : si l'écriture échoue, rien n'est
 * référencé. L'inverse laisserait une ligne pointant sur un fichier absent,
 * qui se découvre au pire moment — quand le voyageur clique dessus.
 */
export async function storeAttachment(input: {
  tripId: number;
  uploadedBy: number;
  file: File;
  visibility: Visibility;
}): Promise<StoreResult> {
  const check = checkUpload({
    name: input.file.name,
    type: input.file.type,
    size: input.file.size,
  });
  if (!check.ok) return { error: check.error };

  const extension = extensionOf(input.file.name);
  const stored = `${randomBytes(16).toString("hex")}${extension ? `.${extension}` : ""}`;
  const root = uploadRoot();

  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, stored), Buffer.from(await input.file.arrayBuffer()));

  const result = getDb()
    .prepare(
      `INSERT INTO attachments (trip_id, uploaded_by, name, stored_name, content_type,
                                size_bytes, visibility)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.tripId,
      input.uploadedBy,
      safeName(input.file.name),
      stored,
      input.file.type.toLowerCase(),
      input.file.size,
      input.visibility,
    );

  return { attachment: getAttachment(Number(result.lastInsertRowid))! };
}

export function getAttachment(id: number): Attachment | null {
  return (
    getDb().prepare<[number], Attachment>(`SELECT * FROM attachments WHERE id = ?`).get(id) ?? null
  );
}

/** Les pièces d'un dossier que ce rôle a le droit de voir. */
export function listAttachments(tripId: number, advisor: boolean): Attachment[] {
  const rows = getDb()
    .prepare<[number], Attachment>(
      `SELECT * FROM attachments WHERE trip_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(tripId);

  return rows.filter((row) => canSee(row.visibility, advisor));
}

/** Le chemin sur le disque ; jamais construit à partir d'une saisie. */
export function pathOf(attachment: Attachment): string {
  return join(uploadRoot(), attachment.stored_name);
}

/**
 * La pièce, si cette personne y a droit sur ce dossier.
 *
 * `membershipRole` a déjà été vérifié par l'appelant ; ce qui se joue ici,
 * c'est que la pièce appartienne bien au dossier demandé et que sa visibilité
 * l'autorise. Les deux contrôles ensemble font qu'un identifiant deviné ne
 * traverse pas d'un dossier à l'autre.
 */
export function readableAttachment(
  attachmentId: number,
  tripId: number,
  advisor: boolean,
): Attachment | null {
  const attachment = getAttachment(attachmentId);
  if (!attachment || attachment.trip_id !== tripId) return null;
  if (!canSee(attachment.visibility, advisor)) return null;
  return attachment;
}

export function setVisibility(attachmentId: number, visibility: Visibility): void {
  getDb()
    .prepare(`UPDATE attachments SET visibility = ? WHERE id = ?`)
    .run(visibility, attachmentId);
}

/** Supprime la ligne et le fichier. Le disque suit la base, jamais l'inverse. */
export function deleteAttachment(attachment: Attachment): void {
  getDb().prepare(`DELETE FROM attachments WHERE id = ?`).run(attachment.id);
  rmSync(pathOf(attachment), { force: true });
}

export { DEFAULT_VISIBILITY };
