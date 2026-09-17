import { redirect } from "next/navigation";
import { isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";

/**
 * L'ancienne page « Économies », héritée de la version grand public : elle
 * comparait ce qu'on avait payé au devis d'une agence.
 *
 * Du côté de l'agence, c'est exactement la page Marges — le même écart, lu
 * depuis l'autre côté du bureau. On ne garde pas deux vérités : l'adresse
 * survit pour les liens et les favoris, et mène là où le chiffre est juste.
 */
export default async function SavingsPage() {
  const user = await requireUser();
  redirect(isAdvisor(user) ? "/marges" : "/mon-voyage");
}
