import Link from "next/link";
import { canSend } from "@/lib/mail-store";
import { RequestResetForm } from "./reset-forms";

export const dynamic = "force-dynamic";

/**
 * Demander un nouveau mot de passe.
 *
 * L'écran ne dit jamais si l'adresse a un compte — il confirme l'envoi dans
 * tous les cas. La seule chose qu'il avoue, c'est quand l'installation n'a pas
 * de serveur d'envoi : là, laisser croire qu'un message est parti serait
 * enfermer quelqu'un dehors sans le lui dire.
 */
export default function ForgottenPasswordPage() {
  const sending = canSend();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <h1 className="text-2xl font-semibold text-stone-900">Mot de passe oublié</h1>
      <p className="mt-2 text-sm text-stone-600">
        Indiquez l'adresse de votre compte : nous vous envoyons un lien pour en choisir un nouveau.
      </p>

      {!sending.configured && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
          L'envoi de messages n'est pas configuré sur cette installation : {sending.reason} Le lien
          sera préparé mais ne partira pas — demandez-le à votre administrateur, qui le trouvera
          dans la file d'envoi.
        </p>
      )}

      <div className="mt-6">
        <RequestResetForm />
      </div>

      <Link href="/login" className="mt-6 text-sm text-stone-500 hover:text-stone-900">
        ← Revenir à la connexion
      </Link>
    </main>
  );
}
