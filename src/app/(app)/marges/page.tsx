import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, EmptyState, HeroStat, StatTile, TableShell } from "@/components/ui";
import { agencyTotals, getAgency, isAdvisor, listAgencyFiles } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { formatDateRange } from "@/lib/format";
import { marginByMonth } from "@/lib/margin";
import { buildVatReturn } from "@/lib/vat-return";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL } from "@/lib/stages";

export const dynamic = "force-dynamic";

const MONTH_LABEL = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

/**
 * Ce que gagne l'agence, dossier par dossier et mois par mois.
 *
 * Les dossiers annulés et les simples idées sont exclus : un devis qui n'a pas
 * été accepté n'est pas du chiffre d'affaires, et le compter serait se mentir.
 */
export default async function MarginsPage() {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const currency = user.currency;
  const agency = getAgency(user.agency_id);
  const files = user.agency_id ? listAgencyFiles(user.agency_id) : [];
  const counted = files.filter((file) => file.counts_towards_revenue);
  const totals = agencyTotals(files);

  const months = marginByMonth(
    counted.map((file) => ({ start_date: file.trip.start_date, margin: file.margin })),
  );
  const target = agency?.target_margin_percent ?? 15;
  const vatReturn = user.agency_id ? buildVatReturn(user.agency_id) : { lines: [], months: [], incomplete: false };
  const below = counted.filter((file) => file.margin.margin_percent < target);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Marges</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Sur les dossiers réservés : avant la réservation, les achats ne sont pas tous saisis et
            la marge n'est qu'une prévision.
          </p>
        </div>
        <a
          href="/api/tva-marge"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50"
        >
          Export TVA (CSV)
        </a>
      </header>

      <HeroStat
        label="Marge nette, après TVA sur marge"
        value={formatMoney(totals.margin_net_cents, currency)}
        hint={
          totals.files > 0
            ? `${formatMoney(totals.sell_cents, currency)} vendus, ${formatMoney(totals.cost_cents, currency)} d'achats, ${formatMoney(totals.margin_cents, currency)} de marge brute dont ${formatMoney(totals.vat_cents, currency)} de TVA.`
            : "Aucun dossier réservé pour l'instant."
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Taux de marque" value={`${totals.margin_percent} %`} hint={`Objectif ${target} %`} />
        <StatTile
          label="TVA sur marge"
          value={formatMoney(totals.vat_cents, currency)}
          hint="Déduite du net ci-dessus"
        />
        <StatTile
          label="Sous l'objectif"
          value={below.length}
          tone={below.length > 0 ? "warning" : "default"}
          hint={below.length > 0 ? "Dossiers à regarder de près" : "Tout est au-dessus"}
        />
      </div>

      <Card title="Par mois de départ">
        {months.length === 0 ? (
          <EmptyState title="Rien à afficher" hint="La marge apparaît dès le premier dossier réservé." />
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-5 py-3">Mois</th>
                <th className="px-5 py-3">Dossiers</th>
                <th className="px-5 py-3 text-right">Vendu</th>
                <th className="px-5 py-3 text-right">Achats</th>
                <th className="px-5 py-3 text-right">Marge</th>
                <th className="px-5 py-3 text-right">Marque</th>
              </tr>
            }
          >
            {months.map((month) => (
              <tr key={month.month}>
                <td className="px-5 py-3 text-stone-800">
                  {MONTH_LABEL.format(new Date(`${month.month}-01T12:00:00`))}
                </td>
                <td className="px-5 py-3 tabular-nums text-stone-600">{month.files}</td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-800">
                  {formatMoney(month.sell_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-500">
                  {formatMoney(month.cost_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-medium text-emerald-700">
                  {formatMoney(month.margin_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-600">
                  {month.margin_percent} %
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title="Dossier par dossier">
        {counted.length === 0 ? (
          <EmptyState title="Aucun dossier réservé" />
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-5 py-3">Dossier</th>
                <th className="px-5 py-3">Dates</th>
                <th className="px-5 py-3">Étape</th>
                <th className="px-5 py-3 text-right">Vendu</th>
                <th className="px-5 py-3 text-right">Marge</th>
                <th className="px-5 py-3 text-right">TVA</th>
                <th className="px-5 py-3 text-right">Net</th>
              </tr>
            }
          >
            {counted.map(({ trip, margin, vat }) => (
              <tr key={trip.id} className="hover:bg-stone-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/trips/${trip.id}`}
                    className="font-medium text-stone-900 hover:text-brand-700"
                  >
                    {trip.title}
                  </Link>
                </td>
                <td className="px-5 py-3 text-stone-600">
                  {formatDateRange(trip.start_date, trip.end_date)}
                </td>
                <td className="px-5 py-3 text-stone-600">{STAGE_LABEL[trip.stage]}</td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-800">
                  {formatMoney(margin.sell_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-600">
                  {formatMoney(margin.margin_cents, currency)}
                  {margin.partial && (
                    <span className="ml-1 text-amber-600" title="Marge pas encore ferme">
                      ≈
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-stone-500">
                  {vat.vat_cents > 0 ? `− ${formatMoney(vat.vat_cents, currency)}` : "exonérée"}
                </td>
                <td
                  className={`px-5 py-3 text-right tabular-nums font-medium ${
                    margin.margin_percent < target ? "text-amber-700" : "text-emerald-700"
                  }`}
                  title={`${margin.margin_percent} % de marque`}
                >
                  {formatMoney(vat.margin_net_cents, currency)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title="TVA sur marge, pour votre comptable">
        <div className="space-y-2 px-5 py-4 text-sm text-stone-600">
          {vatReturn.months.length === 0 ? (
            <p>
              Rien à déclarer pour l'instant : la base du régime est constituée des
              <strong> encaissements</strong>, donc des factures réglées.
            </p>
          ) : (
            <>
              <ul className="space-y-1">
                {vatReturn.months.map((month) => (
                  <li key={month.month} className="flex justify-between gap-3 tabular-nums">
                    <span>{month.month}</span>
                    <span className="text-stone-500">
                      {formatMoney(month.paid_cents, currency)} encaissés · base taxable{" "}
                      {formatMoney(month.taxable_margin_cents, currency)}
                    </span>
                    <strong className="text-stone-800">
                      {formatMoney(month.vat_cents, currency)}
                    </strong>
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-stone-500">
                Base = encaissements de la période, la TVA du dossier étant répartie au prorata de
                ce qui a été encaissé. Document de travail : à confronter avec votre comptabilité
                avant toute déclaration. L'export CSV contient le détail facture par facture.
              </p>
              {vatReturn.incomplete && (
                <p className="text-xs text-amber-700">
                  Un dossier encaissé n'a pas de prix de vente : sa part de marge n'a pas pu être
                  répartie.
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-stone-500">
        Le taux de marque rapporte la marge au prix de vente ; c'est celui dont on parle en agence.
        Le taux de marge, plus élevé, la rapporte au prix d'achat. Un dossier marqué ≈ n'a pas une
        marge ferme : soit une ligne attend son prix de vente, soit un achat n'est pas encore saisi.
      </p>
    </div>
  );
}
