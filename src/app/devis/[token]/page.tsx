import { notFound } from "next/navigation";
import { getAgency } from "@/lib/agency";
import { formatDate, formatDateRange, formatNights } from "@/lib/format";
import { tripNights } from "@/lib/budget";
import { legalMentions, STANDARD_FORM_SOURCE, TRAVELLER_RIGHTS } from "@/lib/legal";
import { formatMoney } from "@/lib/money";
import { buildItinerary } from "@/lib/itinerary";
import { markOpened } from "@/lib/mail-store";
import { depositCents, getQuoteByToken, isDecidable, isExpired } from "@/lib/quotes";
import { getTrip, listBookings } from "@/lib/trips";
import { DecideForm } from "./decide-form";

export const dynamic = "force-dynamic";

/**
 * Le devis, tel que le client le reçoit.
 *
 * Aucune session : le jeton du lien fait foi, et n'ouvre que ce devis. Aucun
 * coût d'achat non plus — cette page est publique, elle ne lit que le devis
 * figé et le programme.
 *
 * Elle porte ce que la loi française exige d'un forfait : mentions de
 * l'agence, formulaire d'information standardisé, conditions. C'est ce qui
 * sépare un devis opposable d'une jolie mise en page.
 */
export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = getQuoteByToken(token);
  if (!found) notFound();

  const { quote, lines } = found;
  const trip = getTrip(quote.trip_id);
  if (!trip) notFound();

  // Le conseiller veut savoir si le client a vu le devis : c'est ce qui décide
  // d'une relance. Seule la première ouverture est notée.
  if (quote.status !== "draft") markOpened("quotes", quote.id);

  const agency = getAgency(quote.agency_id);
  const currency = trip.currency;
  const bookings = listBookings(trip.id);
  const itinerary = buildItinerary(trip, bookings, []);
  const mentions = legalMentions(agency);
  const expired = isExpired(quote);
  const decidable = isDecidable(quote);

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 print:max-w-none print:px-0">
      <header className="border-b border-stone-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {agency?.name ?? "Votre agence"}
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-stone-900">{quote.title}</h1>
            <p className="mt-2 text-stone-600">
              {trip.destination_city}, {trip.destination_country} ·{" "}
              {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(tripNights(trip))}
            </p>
          </div>
          <div className="text-right text-sm text-stone-500">
            <p className="font-medium text-stone-700">Devis {quote.reference}</p>
            {quote.valid_until && <p>Valable jusqu'au {formatDate(quote.valid_until)}</p>}
            <a
              href={`/devis/${quote.token}/pdf`}
              className="mt-2 inline-block rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 print:hidden"
            >
              Télécharger en PDF
            </a>
          </div>
        </div>

        {quote.intro && (
          <p className="mt-5 whitespace-pre-line leading-relaxed text-stone-700">{quote.intro}</p>
        )}
      </header>

      {quote.status === "accepted" && (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset">
          Vous avez accepté ce devis le {formatDate((quote.decided_at ?? "").slice(0, 10))}. Votre
          conseiller revient vers vous avec le contrat et les modalités de règlement.
        </p>
      )}
      {quote.status === "declined" && (
        <p className="mt-6 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Vous avez décliné ce devis. Il reste consultable ; votre conseiller peut vous en proposer
          un autre.
        </p>
      )}
      {quote.status === "draft" && (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
          Ce devis est encore un brouillon : il n'a pas été envoyé et peut changer.
        </p>
      )}
      {expired && quote.status === "sent" && (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200 ring-inset">
          Sa durée de validité est passée. Demandez à votre conseiller de le remettre à jour : les
          prix des prestations ont pu bouger.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-stone-900">Votre voyage</h2>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-stone-100">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">{line.label}</p>
                  {line.detail && <p className="text-stone-500">{line.detail}</p>}
                  {line.start_at && (
                    <p className="text-xs text-stone-400">
                      {formatDate(line.start_at.slice(0, 10))}
                      {line.end_at ? ` → ${formatDate(line.end_at.slice(0, 10))}` : ""}
                    </p>
                  )}
                </td>
                <td className="py-3 text-right align-top tabular-nums text-stone-800">
                  {formatMoney(line.price_cents, currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-300">
              <td className="py-3 font-semibold text-stone-900">Total</td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums text-stone-900">
                {formatMoney(quote.total_cents, currency)}
              </td>
            </tr>
            {quote.deposit_percent > 0 && (
              <tr>
                <td className="pb-3 text-stone-600">
                  dont acompte à la confirmation ({quote.deposit_percent} %)
                </td>
                <td className="pb-3 text-right tabular-nums text-stone-700">
                  {formatMoney(depositCents(quote), currency)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
        <p className="mt-2 text-xs text-stone-500">
          Prix nets par dossier, taxes et frais compris sauf mention contraire. La TVA applicable
          est celle du régime de la marge des agences de voyages.
        </p>
      </section>

      {itinerary.days.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-stone-900">Le programme</h2>
          <ol className="mt-3 space-y-3">
            {itinerary.days.map((day) => (
              <li key={day.date} className="text-sm">
                <p className="font-medium text-stone-900">
                  Jour {day.day_number}
                  <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
                </p>
                {day.starts.length === 0 && day.ongoing.length === 0 && day.returns.length === 0 ? (
                  <p className="text-stone-400">Journée libre.</p>
                ) : (
                  <ul className="text-stone-700">
                    {day.starts.map((booking) => (
                      <li key={`s${booking.id}`}>
                        {booking.vendor}
                        {booking.description ? ` — ${booking.description}` : ""}
                      </li>
                    ))}
                    {day.returns.map((booking) => (
                      <li key={`r${booking.id}`}>
                        {booking.vendor} — retour
                      </li>
                    ))}
                    {day.ongoing.length > 0 && (
                      <li className="text-stone-500">
                        En cours : {day.ongoing.map((booking) => booking.vendor).join(", ")}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {decidable && (
        <section className="mt-8 rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
          <h2 className="text-lg font-semibold text-stone-900">Votre réponse</h2>
          <p className="mt-1 text-sm text-stone-600">
            Accepter ce devis vaut accord sur son contenu et ouvre la réservation. Cela ne vaut pas
            paiement : votre conseiller vous adresse ensuite le contrat.
          </p>
          <DecideForm token={quote.token} />
        </section>
      )}

      {quote.terms && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-stone-900">Conditions</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-stone-700">
            {quote.terms}
          </p>
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-stone-50 p-5">
        <h2 className="text-base font-semibold text-stone-900">
          Formulaire d'information standardisé
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          La combinaison de services de voyage qui vous est proposée constitue un forfait au sens de
          la directive (UE) 2015/2302, transposée au code du tourisme. Vous bénéficierez donc de
          tous les droits octroyés par l'Union européenne applicables aux forfaits.
          {agency?.name ? ` ${agency.name} sera` : " Votre agence sera"} entièrement responsable de
          la bonne exécution du forfait dans son ensemble, et dispose de la garantie financière
          mentionnée ci-dessous pour rembourser vos paiements et, si le transport est compris, pour
          assurer votre rapatriement en cas d'insolvabilité.
        </p>

        <h3 className="mt-4 text-sm font-semibold text-stone-800">
          Droits essentiels au titre de la directive (UE) 2015/2302
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-stone-700">
          {TRAVELLER_RIGHTS.map((right) => (
            <li key={right} className="flex gap-2">
              <span aria-hidden className="text-stone-400">
                —
              </span>
              <span>{right}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs leading-relaxed text-stone-500">
          Modèle officiel et texte de référence :{" "}
          <a href={STANDARD_FORM_SOURCE} className="underline" target="_blank" rel="noreferrer">
            arrêté du 1er mars 2018
          </a>
          . Les dispositions du code du tourisme relatives aux forfaits (art. L211-1 et suivants,
          R211-1 et suivants) vous sont communiquées avec le contrat.
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
          {agency?.email && (
            <div>
              <dt className="font-medium text-stone-700">Contact</dt>
              <dd>
                {agency.email}
                {agency.phone ? ` · ${agency.phone}` : ""}
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-4">
          Devis {quote.reference} établi le {formatDate(quote.created_at.slice(0, 10))}. Document
          sans valeur de contrat : le contrat de voyage vous sera remis par écrit avant tout
          versement.
        </p>
      </footer>
    </main>
  );
}
