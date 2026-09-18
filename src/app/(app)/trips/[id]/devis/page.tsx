import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getAgency, getClient, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { missingForFacturX } from "@/lib/facturx";
import { checkCompliance } from "@/lib/legal";
import { formatMoney } from "@/lib/money";
import {
  depositCents,
  isExpired,
  listQuoteLines,
  listQuotes,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
} from "@/lib/quotes";
import { billingFor, suggestedAmount } from "@/lib/invoices";
import { listInvoices } from "@/lib/invoices-store";
import { dossierMargin } from "@/lib/margin";
import { getTripSummary, listBookings } from "@/lib/trips";
import { deleteQuoteAction, sendQuoteAction } from "./actions";
import { InvoicesCard } from "./invoices-card";
import { NewQuoteForm } from "./new-quote-form";

export const dynamic = "force-dynamic";

/**
 * Les devis du dossier.
 *
 * Un devis envoyé porte son lien public : c'est ce lien qu'on colle dans un
 * e-mail, et c'est par lui que le client accepte. L'acceptation est horodatée
 * et garde le nom saisi — une preuve, pas un accusé de réception.
 */
export default async function QuotesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const { id } = await params;
  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const agency = getAgency(user.agency_id);
  const compliance = checkCompliance(agency);

  // Envoyer un devis, c'est envoyer un message. Sans client rattaché ou sans
  // adresse, l'envoi fige bien le devis mais rien ne part — et le conseiller
  // doit l'apprendre avant de cliquer, pas en attendant une réponse qui ne
  // viendra jamais.
  const client =
    trip.client_id && user.agency_id ? getClient(user.agency_id, trip.client_id) : null;
  const reachable = Boolean(client?.email);
  const quotes = listQuotes(trip.id);
  const bookings = listBookings(trip.id);
  const currency = trip.currency;

  const sellable =
    trip.agency_quote_cents > 0 ||
    bookings.some((booking) => booking.agency_quote_cents > 0);

  const margin = dossierMargin(trip, bookings);
  const invoices = listInvoices(trip.id);
  const billing = billingFor(margin.sell_cents, invoices);
  // Le devis accepté le plus récent sert de référence à la facture ; à défaut,
  // le dossier lui-même fait foi.
  const accepted = quotes.find((quote) => quote.status === "accepted") ?? null;
  const reference = accepted ?? { total_cents: margin.sell_cents, deposit_percent: 30 };
  const suggestions = {
    deposit: suggestedAmount("deposit", reference, billing),
    balance: suggestedAmount("balance", reference, billing),
    full: suggestedAmount("full", reference, billing),
  };

  return (
    <div className="space-y-6">
      {!reachable && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800 ring-1 ring-amber-200 ring-inset">
          {client
            ? `${client.name} n'a pas d'adresse e-mail sur sa fiche : envoyer un devis le figera, mais aucun message ne partira.`
            : "Ce dossier n'est rattaché à aucun client : envoyer un devis le figera, mais aucun message ne partira."}{" "}
          Vous pourrez toujours copier le lien public ci-dessous.
        </p>
      )}

      {!compliance.ready && (
        <Card title="Votre devis ne serait pas conforme" className="border-amber-300">
          <div className="space-y-3 px-5 py-4 text-sm">
            <p className="text-stone-700">
              Vendre un forfait en France engage l'agence : ces mentions doivent figurer sur le
              document remis au voyageur. Elles se renseignent une fois, dans votre agence.
            </p>
            <ul className="space-y-2">
              {compliance.missing.map((mention) => (
                <li key={mention.label} className="rounded-xl bg-amber-50 px-3.5 py-2.5">
                  <p className="font-medium text-amber-900">{mention.label}</p>
                  <p className="text-xs leading-relaxed text-amber-800">{mention.why}</p>
                </li>
              ))}
            </ul>
            <Link href="/account" className="inline-block font-semibold text-brand-700 hover:underline">
              Compléter ma fiche agence →
            </Link>
          </div>
        </Card>
      )}

      <Card title={`Devis (${quotes.length})`}>
        {quotes.length === 0 ? (
          <EmptyState
            title="Aucun devis"
            hint={
              sellable
                ? "Créez-en un ci-dessous : les lignes chiffrées du dossier le composent."
                : "Posez d'abord un prix de vente — un forfait sur le dossier, ou au moins une ligne chiffrée."
            }
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {quotes.map((quote) => {
              const lines = listQuoteLines(quote.id);
              const expired = quote.status === "sent" && isExpired(quote);

              return (
                <li key={quote.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-stone-900">{quote.reference}</span>
                        <Badge className={QUOTE_STATUS_TONE[quote.status]}>
                          {QUOTE_STATUS_LABEL[quote.status]}
                        </Badge>
                        {expired && (
                          <Badge className="bg-amber-100 text-amber-800">Expiré</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-stone-600">
                        {lines.length} ligne{lines.length > 1 ? "s" : ""} ·{" "}
                        {formatMoney(quote.total_cents, currency)} · acompte{" "}
                        {formatMoney(depositCents(quote), currency)} ({quote.deposit_percent} %)
                      </p>
                      <p className="text-xs text-stone-500">
                        {quote.valid_until
                          ? `Valable jusqu'au ${formatDate(quote.valid_until)}`
                          : "Sans date de validité"}
                        {quote.sent_at ? ` · envoyé le ${formatDate(quote.sent_at.slice(0, 10))}` : ""}
                      </p>

                      {quote.status === "accepted" && (
                        <p className="mt-1 text-xs text-emerald-700">
                          Accepté par {quote.decided_by_name} le{" "}
                          {formatDate((quote.decided_at ?? "").slice(0, 10))}
                          {quote.decided_ip ? ` (depuis ${quote.decided_ip})` : ""}.
                        </p>
                      )}
                      {quote.status === "declined" && (
                        <p className="mt-1 text-xs text-rose-700">
                          Refusé le {formatDate((quote.decided_at ?? "").slice(0, 10))}
                          {quote.decided_note ? ` — « ${quote.decided_note} »` : ""}.
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Link
                        href={`/devis/${quote.token}`}
                        target="_blank"
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        Voir le devis
                      </Link>
                      <a
                        href={`/devis/${quote.token}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                      >
                        PDF
                      </a>
                      {quote.status === "draft" && (
                        <>
                          <form action={sendQuoteAction}>
                            <input type="hidden" name="quote_id" value={quote.id} />
                            <SubmitButton pendingLabel="Envoi…">Envoyer au client</SubmitButton>
                          </form>
                          <form action={deleteQuoteAction}>
                            <input type="hidden" name="quote_id" value={quote.id} />
                            <button type="submit" className="text-xs text-stone-400 hover:text-rose-600">
                              Supprimer
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>

                  {quote.status !== "draft" && (
                    <div className="mt-2 space-y-1.5">
                      {/* Savoir si le client a ouvert le devis décide d'une
                          relance : c'est la première chose qu'on demande. */}
                      <p className="text-xs">
                        {quote.opened_at ? (
                          <span className="text-emerald-700">
                            Ouvert par le client le {formatDate(quote.opened_at.slice(0, 10))}
                          </span>
                        ) : (
                          <span className="text-stone-500">Pas encore ouvert par le client</span>
                        )}
                      </p>
                      <p className="truncate rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
                        Lien à envoyer : <span className="text-stone-700">/devis/{quote.token}</span>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`Factures (${invoices.length})`}>
        <InvoicesCard
          tripId={trip.id}
          quoteId={accepted?.id ?? null}
          invoices={invoices}
          billing={billing}
          suggestions={suggestions}
          facturXMissing={missingForFacturX(agency)}
          currency={currency}
        />
      </Card>

      {sellable && (
        <Card title="Nouveau devis">
          <NewQuoteForm
            tripId={trip.id}
            currency={currency}
            defaultTermsText={agency?.terms ?? ""}
          />
        </Card>
      )}
    </div>
  );
}
