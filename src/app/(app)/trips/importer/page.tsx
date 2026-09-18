import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdvisor, listClients } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

/**
 * Importer un programme déjà écrit.
 *
 * C'est la porte d'entrée du produit : le conseiller ne saisit pas un dossier,
 * il dépose ce qu'il a déjà. Tout ce que l'écran promet, c'est de lire — et de
 * montrer honnêtement ce qu'il a compris, ce qu'il a supposé, et ce qu'il n'a
 * pas su rattacher.
 */
export default async function ImportPage() {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const clients = user.agency_id
    ? listClients(user.agency_id).map((client) => ({ id: client.id, name: client.name }))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Importer un programme</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Déposez le programme que vous avez déjà préparé — PDF, Word, ou simplement collé. Nous
            en tirons les journées et les prestations ; vous corrigez ce qu'il faut avant de créer
            le dossier.
          </p>
        </div>
        <Link
          href="/trips/new"
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Saisir à la main
        </Link>
      </div>

      <ImportForm clients={clients} />
    </div>
  );
}
