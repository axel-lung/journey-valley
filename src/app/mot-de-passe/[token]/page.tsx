import Link from "next/link";
import { useableToken } from "@/lib/mail-store";
import { SetPasswordForm } from "../reset-forms";

export const dynamic = "force-dynamic";

/**
 * Choisir un nouveau mot de passe.
 *
 * Le jeton est vérifié avant d'afficher le formulaire, pour ne pas faire
 * remplir un champ qui sera refusé — et parce qu'un lien mort se dit
 * franchement plutôt qu'au moment de valider.
 */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const access = useableToken(token, "reset");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <h1 className="text-2xl font-semibold text-stone-900">Nouveau mot de passe</h1>

      {access ? (
        <>
          <p className="mt-2 text-sm text-stone-600">
            Choisissez-en un nouveau. Toutes vos autres sessions seront déconnectées.
          </p>
          <div className="mt-6">
            <SetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
            Ce lien a expiré ou a déjà servi. Les liens de réinitialisation ne valent qu'une heure
            et qu'une fois.
          </p>
          <Link
            href="/mot-de-passe"
            className="mt-6 text-sm font-semibold text-brand-700 hover:underline"
          >
            Demander un nouveau lien
          </Link>
        </>
      )}
    </main>
  );
}
