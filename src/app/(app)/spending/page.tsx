import Link from "next/link";
import { CategorySpendBars } from "@/components/spend-chart";
import { Badge, Card, EmptyState, StatTile } from "@/components/ui";
import { spendByCategory } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ExpenseCategory } from "@/lib/types";
import { deleteExpenseAction } from "../trips/actions";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Nourriture et boissons",
  transport: "Transports sur place",
  lodging: "Hébergement",
  activities: "Activités",
  shopping: "Achats",
  other: "Divers",
};

const FILTERS = [
  { key: "all", label: "Tout" },
  { key: "mine", label: "Payé par moi" },
  { key: "shared", label: "Partagé" },
  { key: "personal", label: "Personnel" },
];

interface Row {
  id: number;
  trip_id: number;
  trip_title: string;
  currency: string;
  category: ExpenseCategory;
  description: string;
  spent_on: string;
  amount_cents: number;
  shared: number;
  paid_by: number;
  payer_name: string;
  receipt_name: string | null;
}

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filter = FILTERS.find((entry) => entry.key === params.filter) ?? FILTERS[0];
  const currency = user.currency;

  const where = ["e.trip_id IN (SELECT trip_id FROM trip_members WHERE user_id = ?)"];
  const args: Array<number | string> = [user.id];

  if (filter.key === "mine") {
    where.push("e.paid_by = ?");
    args.push(user.id);
  } else if (filter.key === "shared") {
    where.push("e.shared = 1");
  } else if (filter.key === "personal") {
    where.push("e.shared = 0");
  }

  const rows = getDb()
    .prepare<typeof args, Row>(
      `SELECT e.id, e.trip_id, t.title AS trip_title, t.currency, e.category, e.description,
              e.spent_on, e.amount_cents, e.shared, e.paid_by, u.name AS payer_name, e.receipt_name
         FROM expenses e
         JOIN trips t ON t.id = e.trip_id
         JOIN users u ON u.id = e.paid_by
        WHERE ${where.join(" AND ")}
        ORDER BY e.spent_on DESC, e.id DESC
        LIMIT 300`,
    )
    .all(...args);

  const categories = spendByCategory(user.id);
  const total = rows.reduce((sum, row) => sum + row.amount_cents, 0);
  const paidByMe = rows
    .filter((row) => row.paid_by === user.id)
    .reduce((sum, row) => sum + row.amount_cents, 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Dépenses</h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Tout ce qui a été dépensé sur place, sur l'ensemble de vos voyages.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Dans cette vue"
          value={formatMoney(total, currency)}
          hint={`${rows.length} dépense${rows.length > 1 ? "s" : ""}`}
        />
        <StatTile
          label="Vous avez avancé"
          value={formatMoney(paidByMe, currency)}
          hint="Avant tout remboursement entre vous"
        />
        <StatTile
          label="Premier poste"
          value={categories[0] ? CATEGORY_LABEL[categories[0].category] : "—"}
          hint={categories[0] ? formatMoney(categories[0].total_cents, currency) : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Par catégorie">
          {categories.length === 0 ? (
            <EmptyState title="Rien de noté pour l'instant" />
          ) : (
            <CategorySpendBars rows={categories} currency={currency} />
          )}
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((entry) => (
              <Link
                key={entry.key}
                href={`/spending?filter=${entry.key}`}
                className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  entry.key === filter.key
                    ? "bg-stone-900 text-white"
                    : "bg-white text-stone-600 ring-1 ring-stone-200 ring-inset hover:bg-stone-50"
                }`}
              >
                {entry.label}
              </Link>
            ))}
          </div>

          <Card>
            {rows.length === 0 ? (
              <EmptyState
                title="Rien ici"
                hint="Les dépenses se notent depuis un voyage — ouvrez-en un et utilisez « Noter une dépense »."
              />
            ) : (
              <ul className="divide-y divide-stone-100">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">{row.description}</p>
                      <p className="text-xs text-stone-500">
                        {CATEGORY_LABEL[row.category]} · {formatDate(row.spent_on)} · payé par{" "}
                        {row.paid_by === user.id ? "vous" : row.payer_name}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/trips/${row.trip_id}`}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          {row.trip_title}
                        </Link>
                        <Badge
                          className={
                            row.shared
                              ? "bg-brand-50 text-brand-700 ring-brand-200"
                              : "bg-stone-100 text-stone-600 ring-stone-200"
                          }
                        >
                          {row.shared ? "partagée" : "personnelle"}
                        </Badge>
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="tabular-nums text-stone-800">
                        {formatMoney(row.amount_cents, currency)}
                      </p>
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="expense_id" value={row.id} />
                        <button
                          type="submit"
                          className="text-xs text-stone-400 hover:text-rose-600"
                          aria-label={`Supprimer ${row.description}`}
                        >
                          Supprimer
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
