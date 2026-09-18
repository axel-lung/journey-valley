import { getAgency, isAdvisor } from "@/lib/agency";
import { getCurrentUser } from "@/lib/auth";
import { fileName, pdfHeaders, travelBookPdf } from "@/lib/documents";
import { getTripSummary, listBookings, listChecklist, listMembers } from "@/lib/trips";

export const dynamic = "force-dynamic";

/**
 * Le carnet de voyage en PDF : ce qu'on remet avant le départ, et ce que le
 * voyageur garde dans son téléphone.
 *
 * L'appartenance est vérifiée par la requête elle-même : `getTripSummary` ne
 * rend rien pour un dossier dont on n'est pas membre, donc un identifiant
 * deviné donne un 404 et non un document.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Connexion requise.", { status: 401 });

  const { id } = await context.params;
  const trip = getTripSummary(user.id, Number(id));
  if (!trip) return new Response("Dossier introuvable.", { status: 404 });

  const bytes = travelBookPdf({
    trip,
    agency: getAgency(user.agency_id),
    bookings: listBookings(trip.id),
    checklist: listChecklist(trip.id),
    travellers: listMembers(trip.id).map((member) => member.name),
    advisor: isAdvisor(user),
  });

  return new Response(bytes, { headers: pdfHeaders(fileName("carnet", trip.title), bytes) });
}
