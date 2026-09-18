import { redirect } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  canSend,
  KIND_LABEL,
  listMessages,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/lib/mail-store";
import { CopyBody } from "./copy-body";
import { RetryButton } from "./retry-button";

export const dynamic = "force-dynamic";

/**
 * Ce qui est parti, et ce qui ne l'est pas.
 *
 * Un message est écrit dans la file avant d'être envoyé, et y reste s'il
 * échoue. C'est ce qui permet à une agence de travailler avant d'avoir branché
 * son serveur : elle voit le texte, elle le copie, elle l'envoie de sa
 * messagerie. Personne ne perd un devis parce qu'un réglage manquait.
 *
 * Et quand l'envoi échoue, la réponse du serveur est affichée telle quelle :
 * « 535 authentification refusée » se corrige, « erreur d'envoi » ne se
 * corrige pas.
 */
export default async function MessagesPage() {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");
  if (!user.agency_id) redirect("/account");

  const messages = listMessages(user.agency_id);
  const sending = canSend();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Envois</h1>
        <p className="mt-1 text-sm text-stone-600">
          Les devis, factures et invitations que vous avez envoyés, et ce qu'ils sont devenus.
        </p>
      </div>

      {!sending.configured && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800 ring-1 ring-amber-200 ring-inset">
          <strong className="font-semibold">Rien ne part automatiquement.</strong> {sending.reason}{" "}
          Les messages sont préparés et attendent ici : copiez-en le texte et envoyez-le depuis
          votre messagerie. Votre administrateur peut brancher un serveur d'envoi (
          <code className="rounded bg-amber-100 px-1">JV_SMTP_URL</code>) et renseigner l'adresse
          publique du site (<code className="rounded bg-amber-100 px-1">JV_PUBLIC_URL</code>).
        </p>
      )}

      <Card title={`Messages (${messages.length})`}>
        {messages.length === 0 ? (
          <EmptyState
            title="Rien n'est encore parti"
            hint="Envoyez un devis ou émettez une facture : le message apparaîtra ici."
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {messages.map((message) => (
              <li key={message.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-stone-100 text-stone-700 ring-stone-200">
                        {KIND_LABEL[message.kind]}
                      </Badge>
                      <Badge className={`${STATUS_TONE[message.status]} ring-transparent`}>
                        {STATUS_LABEL[message.status]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 font-medium text-stone-900">{message.subject}</p>
                    <p className="text-sm text-stone-500">
                      À {message.to_name || message.to_email} · {message.to_email}
                    </p>
                    <p className="text-xs text-stone-400">
                      {message.sent_at
                        ? `Envoyé le ${formatDate(message.sent_at.slice(0, 10))}`
                        : `Préparé le ${formatDate(message.created_at.slice(0, 10))}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <CopyBody subject={message.subject} body={message.body} />
                    {message.status !== "sent" && sending.configured && (
                      <RetryButton messageId={message.id} />
                    )}
                  </div>
                </div>

                {message.error && (
                  <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    Réponse du serveur : {message.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
