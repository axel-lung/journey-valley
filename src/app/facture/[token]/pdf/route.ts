import { getAgency, getClient } from "@/lib/agency";
import { fileName, invoicePdf, pdfHeaders } from "@/lib/documents";
import { facturXFor, getInvoiceByToken } from "@/lib/invoices-store";
import { getTrip } from "@/lib/trips";

export const dynamic = "force-dynamic";

/**
 * La facture en PDF, celle qu'on envoie et que le comptable classe.
 *
 * Aucune TVA n'y figure : c'est `invoicePdf` qui porte la règle, et cette
 * route ne lui passe que ce qui est déjà public — la facture, le dossier, et à
 * qui elle est adressée. Le XML Factur-X y est joint quand l'agence a renseigné
 * ce qu'une plateforme exige d'elle.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  const invoice = getInvoiceByToken(token);
  if (!invoice) return new Response("Facture introuvable.", { status: 404 });

  const trip = getTrip(invoice.trip_id);
  if (!trip) return new Response("Facture introuvable.", { status: 404 });

  const client = trip.client_id ? getClient(invoice.agency_id, trip.client_id) : null;

  const bytes = invoicePdf({
    invoice,
    trip,
    agency: getAgency(invoice.agency_id),
    billTo: client ? { name: client.name, email: client.email } : null,
    // La facture devient hybride dès que l'agence a de quoi émettre : la page
    // qu'on lit, et la version que la machine lit, dans le même fichier.
    facturX: facturXFor(invoice),
  });

  return new Response(bytes, {
    headers: pdfHeaders(fileName("facture", invoice.reference), bytes),
  });
}
