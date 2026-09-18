import { facturXFor, getInvoiceByToken } from "@/lib/invoices-store";
import { fileName } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * La facture au format structuré, seule.
 *
 * C'est ce fichier que lit un comptable, un logiciel de comptabilité ou une
 * plateforme de dématérialisation. Il est servi à part du PDF parce qu'une
 * intégration en a besoin tel quel, sans avoir à ouvrir le document.
 *
 * Même porte que le reste de la facture : le jeton fait foi et n'ouvre que
 * celle-ci. Un 409 quand l'agence n'a pas de quoi l'émettre — c'est un état à
 * corriger dans ses réglages, pas une absence de ressource.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  const invoice = getInvoiceByToken(token);
  if (!invoice) return new Response("Facture introuvable.", { status: 404 });

  const xml = facturXFor(invoice);
  if (!xml) {
    return new Response(
      "Cette agence n'a pas encore renseigné ce qu'une facture électronique exige d'elle.",
      { status: 409 },
    );
  }

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName("facture", invoice.reference).replace(/\.pdf$/, ".xml")}"`,
      "cache-control": "private, no-store",
    },
  });
}
