import Link from "next/link";
import { CategorySpendBars } from "@/components/spend-chart";
import { Badge, Card, EmptyState, StatTile, TableShell } from "@/components/ui";
import { spendByCategory } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import type { ExpenseCategory } from "@/lib/types";
import { deleteExpenseAction } from "../trips/actions";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Food and drink",
  transport: "Getting around",
  lodging: "Stays",
  activities: "Things to do",
  shopping: "Shopping",
  other: "Other",
};

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "mine", label: "Paid by me" },
  { key: "shared", label: "Split costs" },
  { key: "personal", label: "Personal" },
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
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Spending</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything logged on the road, across every trip you are part of.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="In this view" value={formatMoney(total, currency)} hint={`${rows.length} items`} />
        <StatTile label="You paid" value={formatMoney(paidByMe, currency)} hint="Before anything is settled" />
        <StatTile
          label="Biggest category"
          value={categories[0] ? CATEGORY_LABEL[categories[0].category] : "—"}
          hint={categories[0] ? formatMoney(categories[0].total_cents, currency) : undefined}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="By category" className="xl:col-span-1">
          {categories.length === 0 ? (
            <EmptyState title="Nothing logged yet" />
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
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  entry.key === filter.key
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 ring-inset hover:bg-slate-50"
                }`}
              >
                {entry.label}
              </Link>
            ))}
          </div>

          <Card>
            {rows.length === 0 ? (
              <EmptyState
                title="Nothing here"
                hint="Expenses are logged from a trip — open one and use “Log an expense”."
              />
            ) : (
              <TableShell
                head={
                  <tr>
                    <th className="px-5 py-2.5">Expense</th>
                    <th className="px-5 py-2.5">Trip</th>
                    <th className="px-5 py-2.5">When</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                }
              >
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className="font-medium text-slate-900">{row.description}</span>
                      <p className="text-xs text-slate-500">
                        {CATEGORY_LABEL[row.category]} · paid by{" "}
                        {row.paid_by === user.id ? "you" : row.payer_name}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/trips/${row.trip_id}`}
                        className="text-slate-600 hover:text-slate-900 hover:underline"
                      >
                        {row.trip_title}
                      </Link>
                      <p className="mt-0.5">
                        <Badge
                          className={
                            row.shared
                              ? "bg-brand-50 text-brand-700 ring-brand-200"
                              : "bg-slate-100 text-slate-600 ring-slate-200"
                          }
                        >
                          {row.shared ? "split" : "personal"}
                        </Badge>
                      </p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{row.spent_on}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                      {formatMoney(row.amount_cents, currency)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="expense_id" value={row.id} />
                        <button
                          type="submit"
                          className="text-xs text-slate-400 hover:text-rose-600"
                          aria-label={`Delete ${row.description}`}
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </TableShell>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
