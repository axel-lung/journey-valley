import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { buildMessage, KIND_LABEL, type MessageKind, type Recipient } from "./mail";
import { defaultSender, sendMail, smtpFromEnv, SmtpError } from "./smtp";

/**
 * La file d'envoi.
 *
 * Un message est **écrit d'abord, envoyé ensuite**. C'est ce qui permet à une
 * agence qui n'a pas encore branché son serveur de travailler quand même :
 * elle voit dans l'application le message qui aurait dû partir, avec son lien,
 * et le copie dans sa messagerie. Rien ne se perd, et rien ne ment sur ce qui
 * est parti.
 *
 * C'est aussi ce qui rend l'envoi testable sans réseau : la file se vérifie,
 * la socket se vérifie chez le client.
 */

export type MessageStatus = "queued" | "sent" | "failed";

export interface OutboxMessage {
  id: number;
  agency_id: number | null;
  trip_id: number | null;
  kind: MessageKind;
  to_name: string;
  to_email: string;
  subject: string;
  body: string;
  link: string;
  status: MessageStatus;
  error: string;
  sent_at: string | null;
  created_at: string;
}

export { KIND_LABEL };

export const STATUS_LABEL: Record<MessageStatus, string> = {
  queued: "À envoyer",
  sent: "Envoyé",
  failed: "Échec",
};

export const STATUS_TONE: Record<MessageStatus, string> = {
  queued: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-800",
  failed: "bg-rose-100 text-rose-700",
};

/**
 * L'adresse publique de l'installation, pour écrire un lien qu'on peut coller
 * dans un message. Sans elle, le lien reste relatif — visible et copiable dans
 * l'application, mais inutilisable depuis une boîte mail, ce que l'écran dit.
 */
export function baseUrl(): string {
  return (process.env.JV_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
}

export function publicUrl(path: string): string {
  return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Vrai quand l'installation sait écrire des liens absolus et envoyer. */
export function canSend(): { configured: boolean; reason: string } {
  if (!baseUrl()) {
    return {
      configured: false,
      reason:
        "L'adresse publique du site n'est pas renseignée (JV_PUBLIC_URL) : les liens des messages seraient relatifs.",
    };
  }
  try {
    if (!smtpFromEnv()) {
      return {
        configured: false,
        reason: "Aucun serveur d'envoi n'est configuré (JV_SMTP_URL).",
      };
    }
  } catch (error) {
    return { configured: false, reason: (error as Error).message };
  }
  return { configured: true, reason: "" };
}

/* ------------------------------------------------------------------ file */

export function queueMessage(input: {
  agencyId: number | null;
  tripId?: number | null;
  kind: MessageKind;
  to: Recipient;
  subject: string;
  body: string;
  link?: string;
}): number {
  const result = getDb()
    .prepare(
      `INSERT INTO messages (agency_id, trip_id, kind, to_name, to_email, subject, body, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.agencyId,
      input.tripId ?? null,
      input.kind,
      input.to.name,
      input.to.email,
      input.subject,
      input.body,
      input.link ?? "",
    );

  return Number(result.lastInsertRowid);
}

export function getMessage(messageId: number): OutboxMessage | null {
  return (
    getDb()
      .prepare<[number], OutboxMessage>(`SELECT * FROM messages WHERE id = ?`)
      .get(messageId) ?? null
  );
}

/**
 * La file d'une agence.
 *
 * Un message de réinitialisation destiné à un voyageur n'a pas d'agence — son
 * compte n'en dépend pas — et n'apparaît donc dans aucune file. C'est
 * volontaire : un lien de réinitialisation ne se lit pas par-dessus l'épaule
 * de celui à qui il est destiné.
 */
export function listMessages(agencyId: number, limit = 50): OutboxMessage[] {
  return getDb()
    .prepare<[number, number], OutboxMessage>(
      `SELECT * FROM messages WHERE agency_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(agencyId, limit);
}

export function countQueued(agencyId: number): number {
  const row = getDb()
    .prepare<[number], { count: number }>(
      `SELECT COUNT(*) AS count FROM messages WHERE agency_id = ? AND status <> 'sent'`,
    )
    .get(agencyId);
  return row?.count ?? 0;
}

/**
 * Tente l'envoi d'un message de la file.
 *
 * Ne jette jamais : l'échec se range dans la ligne, avec la réponse du serveur
 * telle quelle. « 535 authentification refusée » se corrige ; « l'envoi a
 * échoué » ne se corrige pas.
 */
export async function deliver(messageId: number, fromEmail: string): Promise<OutboxMessage | null> {
  const message = getMessage(messageId);
  if (!message || message.status === "sent") return message;

  const db = getDb();
  const fail = (reason: string) => {
    db.prepare(`UPDATE messages SET status = 'failed', error = ? WHERE id = ?`).run(
      reason.slice(0, 500),
      messageId,
    );
    return getMessage(messageId);
  };

  let config;
  try {
    config = smtpFromEnv();
  } catch (error) {
    return fail((error as Error).message);
  }
  if (!config) {
    // Pas configuré n'est pas un échec : le message attend, et l'écran dit
    // pourquoi. Le conseiller peut le copier en attendant.
    return message;
  }

  const sender = defaultSender(fromEmail);
  try {
    await sendMail({
      config,
      from: sender.email,
      to: message.to_email,
      message: buildMessage({
        from: { name: sender.name, email: sender.email },
        to: { name: message.to_name, email: message.to_email },
        replyTo: fromEmail && fromEmail !== sender.email ? { name: "", email: fromEmail } : null,
        subject: message.subject,
        body: message.body,
      }),
    });
  } catch (error) {
    return fail(error instanceof SmtpError ? error.message : String(error));
  }

  db.prepare(
    `UPDATE messages SET status = 'sent', error = '', sent_at = datetime('now') WHERE id = ?`,
  ).run(messageId);
  return getMessage(messageId);
}

/** Met en file puis tente l'envoi, ce que font tous les appelants. */
export async function queueAndDeliver(
  input: Parameters<typeof queueMessage>[0] & { fromEmail: string },
): Promise<OutboxMessage | null> {
  const id = queueMessage(input);
  return deliver(id, input.fromEmail);
}

/* ------------------------------------------------- jetons d'accès */

export type AccessKind = "reset" | "invite";

export interface AccessToken {
  token: string;
  kind: AccessKind;
  user_id: number | null;
  client_id: number | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * Crée un jeton d'accès.
 *
 * Les jetons antérieurs du même type et du même destinataire sont effacés :
 * demander un nouveau lien doit invalider l'ancien, sinon un lien oublié dans
 * une boîte mail reste une clé.
 */
export function createAccessToken(input: {
  kind: AccessKind;
  userId?: number | null;
  clientId?: number | null;
  hours: number;
}): string {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + input.hours * 3_600_000).toISOString();

  if (input.userId) {
    db.prepare(`DELETE FROM access_tokens WHERE kind = ? AND user_id = ?`).run(
      input.kind,
      input.userId,
    );
  }
  if (input.clientId) {
    db.prepare(`DELETE FROM access_tokens WHERE kind = ? AND client_id = ?`).run(
      input.kind,
      input.clientId,
    );
  }

  db.prepare(
    `INSERT INTO access_tokens (token, kind, user_id, client_id, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(token, input.kind, input.userId ?? null, input.clientId ?? null, expires);

  return token;
}

/** Le jeton, s'il est encore valable : ni expiré, ni déjà servi. */
export function useableToken(token: string, kind: AccessKind): AccessToken | null {
  const row = getDb()
    .prepare<[string, AccessKind], AccessToken>(
      `SELECT * FROM access_tokens WHERE token = ? AND kind = ?`,
    )
    .get(token, kind);

  if (!row) return null;
  if (row.used_at) return null;
  if (Date.parse(row.expires_at) < Date.now()) return null;
  return row;
}

export function consumeToken(token: string): void {
  getDb()
    .prepare(`UPDATE access_tokens SET used_at = datetime('now') WHERE token = ?`)
    .run(token);
}

/* ------------------------------------------------------ suivi d'ouverture */

/**
 * Note qu'un devis ou une facture a été ouvert.
 *
 * Seule la première fois compte : ce qu'un conseiller veut savoir, c'est si le
 * client a vu le document, pas combien de fois il a rafraîchi la page.
 */
export function markOpened(table: "quotes" | "invoices", id: number): void {
  getDb()
    .prepare(`UPDATE ${table} SET opened_at = datetime('now') WHERE id = ? AND opened_at IS NULL`)
    .run(id);
}
