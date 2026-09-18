import Link from "next/link";
import { getDb } from "@/lib/db";
import { useableToken } from "@/lib/mail-store";
import { AcceptInviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

/**
 * L'invitation, telle que le voyageur la reçoit.
 *
 * Aucun compte requis pour arriver ici : le jeton fait foi, et il n'ouvre
 * qu'une chose — la création de cet accès-là. L'adresse est déjà connue, donc
 * elle est affichée et non demandée : c'est le conseiller qui l'a saisie, et
 * elle identifie l'invitation.
 */
export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = useableToken(token, "invite");

  const client = access?.client_id
    ? getDb()
        .prepare<[number], { name: string; email: string; user_id: number | null; agency: string }>(
          `SELECT c.name, c.email, c.user_id, a.name AS agency
             FROM clients c JOIN agencies a ON a.id = c.agency_id
            WHERE c.id = ?`,
        )
        .get(access.client_id)
    : null;

  const usable = Boolean(client && !client.user_id);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      {usable && client ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {client.agency}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">Votre espace voyageur</h1>
          <p className="mt-2 text-sm text-stone-600">
            Votre programme, vos réservations et votre carnet de voyage, sur ordinateur comme sur
            téléphone. Choisissez un mot de passe pour ouvrir votre accès.
          </p>
          <p className="mt-4 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
            Vous vous connecterez avec <span className="font-medium text-stone-900">{client.email}</span>.
          </p>

          <div className="mt-6">
            <AcceptInviteForm token={token} name={client.name} />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-stone-900">Invitation expirée</h1>
          <p className="mt-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
            Ce lien a expiré, a déjà servi, ou l'accès a été ouvert entre-temps. Demandez-en un
            nouveau à votre conseiller.
          </p>
          <Link href="/login" className="mt-6 text-sm font-semibold text-brand-700 hover:underline">
            J'ai déjà un compte
          </Link>
        </>
      )}
    </main>
  );
}
