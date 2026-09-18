import { readFileSync } from "node:fs";
import { isAdvisor } from "@/lib/agency";
import { getAttachment, pathOf, readableAttachment } from "@/lib/attachments-store";
import { getCurrentUser } from "@/lib/auth";
import { membershipRole } from "@/lib/trips";

export const dynamic = "force-dynamic";

/**
 * Le téléchargement d'une pièce.
 *
 * Trois contrôles, dans cet ordre, et aucun n'est facultatif : une session,
 * l'appartenance au dossier qui porte la pièce, puis la visibilité. Un
 * identifiant deviné ne traverse donc ni d'un compte à l'autre, ni d'un
 * dossier à l'autre, ni de l'interne vers le voyageur.
 *
 * Tous les refus rendent le même 404 : distinguer « ça n'existe pas » de
 * « vous n'y avez pas droit » revient à confirmer l'existence d'un document
 * à qui n'a pas à le savoir.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Connexion requise.", { status: 401 });

  const { id } = await context.params;
  const found = getAttachment(Number(id));
  if (!found) return new Response("Pièce introuvable.", { status: 404 });

  if (!membershipRole(user.id, found.trip_id)) {
    return new Response("Pièce introuvable.", { status: 404 });
  }

  const attachment = readableAttachment(found.id, found.trip_id, isAdvisor(user));
  if (!attachment) return new Response("Pièce introuvable.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = readFileSync(pathOf(attachment));
  } catch {
    return new Response("Ce fichier n'est plus sur le serveur.", { status: 404 });
  }

  const body = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  body.set(bytes);

  return new Response(body, {
    headers: {
      "content-type": attachment.content_type,
      "content-length": String(body.byteLength),
      // Le nom d'origine ne sort qu'ici, entre guillemets et sans retour à la
      // ligne : un en-tête ne se laisse pas écrire par un nom de fichier.
      "content-disposition": `inline; filename="${attachment.name.replace(/["\r\n]/g, "")}"`,
      "cache-control": "private, no-store",
      // Une pièce est une donnée, pas une page : rien ne doit s'y exécuter.
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
