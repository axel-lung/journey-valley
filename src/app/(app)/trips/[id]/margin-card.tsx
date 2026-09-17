import { Card, ProvisionalNote } from "@/components/ui";
import { SavingsBars } from "@/components/spend-chart";
import { roundToEuro, sellPriceFor, type DossierMargin } from "@/lib/margin";
import { formatMoney, type Currency } from "@/lib/money";
import { describeVat, type VatBreakdown } from "@/lib/vat";

/**
 * La marge du dossier, du point de vue du conseiller.
 *
 * Elle affiche les deux taux — marque et marge — parce que les confondre coûte
 * cher, et elle dit franchement quand le chiffre est incomplet : une ligne sans
 * prix de vente tire la marge vers le bas, et annoncer ce plancher comme un
 * résultat ferait perdre de l'argent à l'agence.
 */
export function MarginCard({
  margin,
  vat,
  currency,
  targetMarginPercent,
}: {
  margin: DossierMargin;
  vat: VatBreakdown;
  currency: Currency;
  targetMarginPercent: number;
}) {
  if (margin.basis === "none" && margin.cost_cents === 0) return null;

  const suggested = roundToEuro(sellPriceFor(margin.cost_cents, targetMarginPercent));
  const missingToTarget = suggested - margin.sell_cents;

  return (
    <Card
      title={margin.basis === "package" ? "Marge du dossier (forfait)" : "Marge du dossier"}
      className="border-brand-200"
    >
      {/* SavingsBars porte déjà sa propre marge intérieure. */}
      <SavingsBars
        agencyCents={margin.sell_cents}
        yourCents={margin.cost_cents}
        currency={currency}
        agencyLabel="Prix de vente client"
        yourLabel="Coût fournisseurs"
      />

      <div className="space-y-4 px-5 pb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Marge nette"
            value={formatMoney(vat.margin_net_cents, currency)}
            hint="après TVA sur marge"
            strong
          />
          <Figure label="Taux de marque" value={`${margin.margin_percent} %`} hint="marge / vente" />
          <Figure label="Taux de marge" value={`${margin.markup_percent} %`} hint="marge / achat" />
        </div>

        {/* La TVA sur marge est le calcul que les tableurs ratent : marge TTC,
            taxe extraite, part hors UE exonérée. On montre le détail plutôt
            qu'un total à croire sur parole. */}
        <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-stone-600">Marge brute</span>
            <span className="tabular-nums text-stone-800">
              {formatMoney(margin.margin_cents, currency)}
            </span>
          </div>
          {vat.exempt_margin_cents > 0 && (
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-stone-600">dont hors UE, exonérée</span>
              <span className="tabular-nums text-stone-500">
                {formatMoney(vat.exempt_margin_cents, currency)}
              </span>
            </div>
          )}
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-stone-600">
              TVA sur marge ({vat.rate_percent} %, extraite du TTC)
            </span>
            <span className="tabular-nums text-rose-700">
              − {formatMoney(vat.vat_cents, currency)}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-stone-200 pt-1.5">
            <span className="font-medium text-stone-800">Vous gardez</span>
            <span className="tabular-nums font-semibold text-emerald-700">
              {formatMoney(vat.margin_net_cents, currency)}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-500">{describeVat(vat)}</p>
        </div>

        {margin.partial_reason === "unpriced_lines" && (
          <ProvisionalNote>
            {margin.unpriced_lines} ligne{margin.unpriced_lines > 1 ? "s" : ""} sans prix de vente :
            leur coût est compté, pas leur vente. La marge ci-dessus est donc un{" "}
            <strong>plancher</strong>, pas votre résultat — renseignez les prix, ou posez un forfait
            sur le dossier.
          </ProvisionalNote>
        )}

        {margin.partial_reason === "purchases_incomplete" && (
          <ProvisionalNote>
            Le forfait couvre tout le séjour, vos achats pas encore : tant que le dossier n'est pas
            réservé, cette marge est un <strong>plafond</strong>. Elle baissera à mesure que les
            réservations arrivent, et ne compte pas dans le chiffre de l'agence.
          </ProvisionalNote>
        )}

        {margin.basis === "package" && !margin.partial && margin.unpriced_lines > 0 && (
          <p className="text-xs leading-relaxed text-stone-500">
            Le forfait fait foi : la marge est calculée sur lui, quelles que soient les lignes
            derrière. {margin.unpriced_lines} ligne{margin.unpriced_lines > 1 ? "s" : ""} sans prix
            de vente ne la fausse{margin.unpriced_lines > 1 ? "nt" : ""} pas.
          </p>
        )}

        {margin.cost_cents > 0 && (
          <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm">
            <p className="text-stone-700">
              À {targetMarginPercent} % de marque, ce dossier se vend{" "}
              <strong className="text-stone-900">{formatMoney(suggested, currency)}</strong>.
            </p>
            {margin.sell_cents > 0 && missingToTarget > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Soit {formatMoney(missingToTarget, currency)} de plus que ce qui est posé
                aujourd'hui.
              </p>
            )}
            {margin.sell_cents > 0 && missingToTarget <= 0 && (
              <p className="mt-1 text-xs text-emerald-700">Votre prix est au-dessus de l'objectif.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 ring-1 ring-stone-200 ring-inset">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p
        className={`mt-0.5 tabular-nums ${
          strong ? "text-xl font-semibold text-emerald-700" : "text-lg font-medium text-stone-900"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-stone-400">{hint}</p>}
    </div>
  );
}
