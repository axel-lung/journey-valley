import { isAdvisor } from "@/lib/agency";
import { getCurrentUser } from "@/lib/auth";
import { buildVatReturn, toCsv } from "@/lib/vat-return";

/**
 * L'aide à la déclaration, en CSV.
 *
 * Réservée au conseiller de l'agence concernée : le fichier porte ses marges,
 * c'est la donnée la plus sensible du produit.
 */
export async function GET(): Promise<Response> {
  // Une route d'API répond, elle ne lance pas : sans session on renvoie 401,
  // pas une erreur 500 avec une pile dans les journaux.
  const user = await getCurrentUser();
  if (!user) return new Response("Connectez-vous.", { status: 401 });
  if (!isAdvisor(user) || !user.agency_id) {
    return new Response("Réservé aux conseillers.", { status: 403 });
  }

  const report = buildVatReturn(user.agency_id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(toCsv(report), {
    headers: {
      // Le BOM pour qu'Excel reconnaisse l'UTF-8 et n'abîme pas les accents.
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tva-sur-marge-${stamp}.csv"`,
    },
  });
}
