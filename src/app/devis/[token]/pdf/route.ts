import { getAgency } from "@/lib/agency";
import { fileName, pdfHeaders, quotePdf } from "@/lib/documents";
import { getQuoteByToken } from "@/lib/quotes";
import { getTrip, listBookings } from "@/lib/trips";

export const dynamic = "force-dynamic";

/**
 * Le devis en PDF — le fichier que le conseiller joint à son message.
 *
 * Même porte que la page publique : le jeton fait foi, et n'ouvre que ce
 * devis. Le document se construit depuis les lignes figées, jamais depuis le
 * dossier, donc il dit exactement ce que le client a sous les yeux.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await context.params;

  const found = getQuoteByToken(token);
  if (!found) return new Response("Devis introuvable.", { status: 404 });

  const trip = getTrip(found.quote.trip_id);
  if (!trip) return new Response("Devis introuvable.", { status: 404 });

  const bytes = quotePdf({
    quote: found.quote,
    lines: found.lines,
    trip,
    agency: getAgency(found.quote.agency_id),
    bookings: listBookings(trip.id),
  });

  return new Response(bytes, { headers: pdfHeaders(fileName("devis", found.quote.reference), bytes) });
}
