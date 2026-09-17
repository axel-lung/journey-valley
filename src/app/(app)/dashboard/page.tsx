import { redirect } from "next/navigation";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { AgencyDashboard } from "./agency-dashboard";

export const dynamic = "force-dynamic";

/**
 * L'accueil, selon qui entre.
 *
 * Le conseiller arrive sur son portefeuille. Le voyageur n'a pas de tableau de
 * bord : il a un voyage, et c'est son espace qui le lui montre — l'ancien
 * accueil grand public, bâti autour de « ce que vous économisez face à une
 * agence », n'avait plus de sens une fois l'agence devenue la cliente.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  return <AgencyDashboard user={user} agency={getAgency(user.agency_id)} />;
}
