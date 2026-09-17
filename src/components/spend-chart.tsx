import { formatMoney, formatMoneyCompact, percentOf, type Currency } from "@/lib/money";
import type { CategorySpend, SpendPoint } from "@/lib/analytics";

/* Categorical slots 1 and 2 of the validated default palette (blue / orange):
   adjacent CVD ΔE 24.7, normal-vision ΔE 33.6, both ≥ 3:1 on white. */
const SERIES_BOOKED = "#2a78d6";
const SERIES_SPENT = "#eb6834";

const CATEGORY_LABEL: Record<string, string> = {
  food: "Nourriture et boissons",
  transport: "Transports sur place",
  lodging: "Hébergement",
  activities: "Activités",
  shopping: "Achats",
  other: "Divers",
};

/**
 * Booked (paid up front) vs. spent on the road, per month.
 * Two series, so a legend is always shown; per-bar values live in the hover
 * tooltip and the table view rather than on every mark.
 */
export function MonthlySpendChart({
  points,
  currency,
}: {
  points: SpendPoint[];
  currency: Currency;
}) {
  const max = Math.max(1, ...points.flatMap((point) => [point.booked_cents, point.spent_cents]));

  return (
    <figure className="px-5 pb-4 pt-4">
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-stone-600">
        <LegendSwatch color={SERIES_BOOKED} label="Réservé à l’avance" />
        <LegendSwatch color={SERIES_SPENT} label="Dépensé sur place" />
        <span className="ml-auto text-stone-400">Max. {formatMoneyCompact(max, currency)}</span>
      </figcaption>

      <div className="mt-4 flex h-44 items-end gap-3 border-b border-stone-200">
        {points.map((point) => (
          <div key={point.month} className="group relative flex h-full flex-1 items-end gap-0.5">
            <Bar
              heightPercent={percentOf(point.booked_cents, max)}
              color={SERIES_BOOKED}
              label={`Réservé en ${point.month}`}
            />
            <Bar
              heightPercent={percentOf(point.spent_cents, max)}
              color={SERIES_SPENT}
              label={`Dépensé en ${point.month}`}
            />

            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
              <p className="font-medium">{point.month}</p>
              <p className="text-stone-300">Réservé {formatMoney(point.booked_cents, currency)}</p>
              <p className="text-stone-300">Dépensé {formatMoney(point.spent_cents, currency)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-3">
        {points.map((point) => (
          <div key={point.month} className="flex-1 text-center text-xs text-stone-500">
            {point.label}
          </div>
        ))}
      </div>

      <details className="mt-4 text-xs text-stone-500">
        <summary className="cursor-pointer select-none hover:text-stone-800">Voir le tableau</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-stone-400">
            <tr>
              <th className="py-1 font-medium">Mois</th>
              <th className="py-1 text-right font-medium">Réservé</th>
              <th className="py-1 text-right font-medium">Dépensé</th>
            </tr>
          </thead>
          <tbody className="text-stone-600">
            {points.map((point) => (
              <tr key={point.month} className="border-t border-stone-100">
                <td className="py-1">{point.month}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatMoney(point.booked_cents, currency)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatMoney(point.spent_cents, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Bar({
  heightPercent,
  color,
  label,
}: {
  heightPercent: number;
  color: string;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className="w-full rounded-t"
      style={{
        height: `${Math.max(heightPercent, heightPercent > 0 ? 2 : 0)}%`,
        backgroundColor: color,
      }}
    />
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/**
 * Single-series magnitude comparison, so every bar carries its own value label
 * and no legend is needed — the card title names the measure.
 */
export function CategorySpendBars({
  rows,
  currency,
}: {
  rows: CategorySpend[];
  currency: Currency;
}) {
  const max = Math.max(1, ...rows.map((row) => row.total_cents));

  return (
    <ul className="space-y-3 px-5 py-4">
      {rows.map((row) => (
        <li key={row.category}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-stone-700">
              {CATEGORY_LABEL[row.category] ?? row.category}
            </span>
            <span className="tabular-nums text-stone-600">
              {formatMoney(row.total_cents, currency)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(percentOf(row.total_cents, max), 2)}%`,
                backgroundColor: SERIES_BOOKED,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two paired bars — what the agency wanted vs. what the trip actually cost.
 * Both bars are labelled directly, so the comparison reads without a legend.
 */
export function SavingsBars({
  agencyCents,
  yourCents,
  currency,
  agencyLabel = "Devis agence",
  yourLabel = "Vous avez payé",
}: {
  agencyCents: number;
  yourCents: number;
  currency: Currency;
  /** Les deux barres servent aussi à comparer vente et coût, côté agence. */
  agencyLabel?: string;
  yourLabel?: string;
}) {
  const max = Math.max(1, agencyCents, yourCents);

  const rows = [
    { label: agencyLabel, value: agencyCents, color: SERIES_SPENT },
    { label: yourLabel, value: yourCents, color: SERIES_BOOKED },
  ];

  return (
    <div className="space-y-3 px-5 py-4">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-stone-700">{row.label}</span>
            <span className="tabular-nums text-stone-600">{formatMoney(row.value, currency)}</span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(percentOf(row.value, max), 2)}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
