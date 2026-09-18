import { notFound } from "next/navigation";
import { getAgency } from "@/lib/agency";
import { formatDate, formatDateRange } from "@/lib/format";
import { INVOICE_KIND_LABEL, MARGIN_SCHEME_MENTION } from "@/lib/invoices";
import { getInvoiceByToken } from "@/lib/invoices-store";
import { legalMentions } from "@/lib/legal";
import { formatMoney } from "@/lib/money";
import { getTrip } from "@/lib/trips";

export const dynamic = "force-dynamic";

/**
 * La facture, telle que le client la reçoit.
 *
 * **Aucune TVA n'y figure, et c'est volontaire.** Sous le régime de la marge
 * des agences de voyages, ne pas mentionner la taxe est une condition
 * d'application du régime : la faire apparaître révélerait la marge — elle en
 * est 20/120 — et ouvrirait à tort un droit à déduction au client. En
 * contrepartie, la mention « Régime particulier – agences de voyages » est
 * obligatoire, à l'amende près par facture manquante.
 *
 * La TVA existe donc ailleurs dans le produit : calculée pour le conseiller,
 * exportée pour le comptable. Ici, un montant à payer.
 */
export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invoice = getInvoiceByToken(token);
  if (!invoice) notFound();

  const trip = getTrip(invoice.trip_id);
  if (!trip) notFound();

  const agency = getAgency(invoice.agency_id);
  const currency = trip.currency;
  const mentions = legalMentions(agency);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 print:max-w-none print:px-0">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {agency?.name ?? "Votre agence"}
          </p>
          {agency?.legal_name && <p className="text-sm text-stone-600">{agency.legal_name}</p>}
          {agency?.email && <p className="text-sm text-stone-500">{agency.email}</p>}
          {agency?.phone && <p className="text-sm text-stone-500">{agency.phone}</p>}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-semibold text-stone-900">
            {INVOICE_KIND_LABEL[invoice.kind]}
          </h1>
          <p className="text-sm font-medium text-stone-700">{invoice.reference}</p>
          <p className="text-sm text-stone-500">
            {invoice.issued_at
              ? `Émise le ${formatDate(invoice.issued_at.slice(0, 10))}`
              : "Brouillon, non émise"}
          </p>
          {invoice.due_date && (
            <p className="text-sm text-stone-500">Échéance : {formatDate(invoice.due_date)}</p>
          )}
          <a
            href={`/facture/${invoice.token}/pdf`}
            className="mt-2 inline-block rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 print:hidden"
          >
            Télécharger en PDF
          </a>
        </div>
      </header>

      {invoice.status === "draft" && (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
          Cette facture n'a pas encore été émise : elle peut changer.
        </p>
      )}
      {invoice.status === "cancelled" && (
        <p className="mt-6 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Facture annulée. Son numéro est conservé pour la continuité de la numérotation.
        </p>
      )}
      {invoice.status === "paid" && (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset">
          Réglée le {formatDate((invoice.paid_at ?? "").slice(0, 10))}. Merci.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Objet</h2>
        <table className="mt-3 w-full text-sm">
          <tbody>
            <tr className="border-b border-stone-100">
              <td className="py-3 pr-4">
                <p className="font-medium text-stone-900">{invoice.label || trip.title}</p>
                <p className="text-stone-500">
                  {trip.destination_city}, {trip.destination_country} ·{" "}
                  {formatDateRange(trip.start_date, trip.end_date)}
                </p>
                <p className="text-xs text-stone-400">
                  {INVOICE_KIND_LABEL[invoice.kind]} sur le voyage à forfait
                </p>
              </td>
              <td className="py-3 text-right align-top tabular-nums text-stone-800">
                {formatMoney(invoice.total_cents, currency)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 text-base font-semibold text-stone-900">Total à payer</td>
              <td className="py-3 text-right text-xl font-semibold tabular-nums text-stone-900">
                {formatMoney(invoice.total_cents, currency)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-3 rounded-xl bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-600">
          <strong className="text-stone-800">{MARGIN_SCHEME_MENTION}</strong> — la TVA n'est pas
          mentionnée sur cette facture et n'est pas récupérable par le client, conformément au
          régime particulier applicable aux agences de voyages (art. 266-1-e du code général des
          impôts).
        </p>
      </section>

      <footer className="mt-8 border-t border-stone-200 pt-5 text-xs leading-relaxed text-stone-500">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {mentions.map((mention) => (
            <div key={mention.label}>
              <dt className="font-medium text-stone-700">{mention.label}</dt>
              <dd className={mention.missing ? "text-amber-700" : ""}>
                {mention.missing ? "à compléter par l'agence" : mention.value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4">
          Pénalités de retard : taux d'intérêt légal majoré, et indemnité forfaitaire de 40 € pour
          frais de recouvrement entre professionnels. Pas d'escompte pour paiement anticipé.
        </p>
      </footer>
    </main>
  );
}
