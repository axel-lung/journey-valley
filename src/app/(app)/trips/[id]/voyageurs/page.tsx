import { notFound, redirect } from "next/navigation";
import { Badge, Card, EmptyState } from "@/components/ui";
import { isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { budgetStatus, settlementPlan, splitBalances } from "@/lib/budget";
import { formatDate, formatDateRange, initials } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getTripSummary, listBookings, listExpenses, listMembers } from "@/lib/trips";
import type { ExpenseCategory } from "@/lib/types";
import { deleteExpenseAction, removeCompanionAction } from "../../actions";
import { CompanionForm } from "../companion-form";
import { ExpenseForm } from "../expense-form";
import { ShareSummary } from "../share-summary";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Nourriture et boissons",
  transport: "Transports sur place",
  lodging: "Hébergement",
  activities: "Activités",
  shopping: "Achats",
  other: "Divers",
};

/** Qui part, ce qu'ils dépensent sur place, et qui doit quoi à qui. */
export default async function TravellersPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const { id } = await params;
  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);
  const budget = budgetStatus(trip, bookings, expenses);
  const balances = splitBalances(members, expenses);
  const transfers = settlementPlan(balances);
  const isOwner = trip.my_role === "owner";
  const editable = trip.stage !== "cancelled";
  const nameById = new Map(members.map((member) => [member.user_id, member.name]));

  const summaryText = [
    `${trip.title} — ${formatDateRange(trip.start_date, trip.end_date)}`,
    `Total : ${formatMoney(budget.committed_cents, currency)} (${formatMoney(budget.per_traveller_cents, currency)} par personne)`,
    "",
    ...balances.map((balance) =>
      balance.net_cents === 0
        ? `${balance.name} : à jour`
        : balance.net_cents > 0
          ? `${balance.name} : on lui doit ${formatMoney(balance.net_cents, currency)}`
          : `${balance.name} : doit ${formatMoney(-balance.net_cents, currency)}`,
    ),
    ...(transfers.length > 0
      ? ["", "Pour être quittes :", ...transfers.map((transfer) => `${transfer.from_name} → ${transfer.to_name} : ${formatMoney(transfer.amount_cents, currency)}`)]
      : []),
  ].join("\n");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Qui vient">
          <ul className="divide-y divide-stone-100">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {member.name}
                      {member.user_id === user.id && (
                        <span className="ml-1.5 text-xs text-stone-400">vous</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-stone-500">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      member.role === "owner"
                        ? "bg-brand-50 text-brand-700 ring-brand-200"
                        : "bg-stone-100 text-stone-600 ring-stone-200"
                    }
                  >
                    {member.role === "owner" ? "organisateur" : "compagnon"}
                  </Badge>
                  {isOwner && member.role !== "owner" && (
                    <form action={removeCompanionAction}>
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <button type="submit" className="text-xs text-stone-400 hover:text-rose-600">
                        Retirer
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {isOwner && editable && <CompanionForm tripId={trip.id} />}
        </Card>

        <Card title="Qui doit quoi">
          {expenses.length === 0 || members.length < 2 ? (
            <EmptyState
              title="Rien à régler"
              hint="Dès qu'une dépense partagée est notée, le décompte apparaît ici."
            />
          ) : (
            <>
              <ul className="divide-y divide-stone-100">
                {balances.map((balance) => (
                  <li
                    key={balance.user_id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span className="text-stone-700">{balance.name}</span>
                    <span className="text-right">
                      <span
                        className={`tabular-nums ${
                          balance.net_cents > 0
                            ? "text-emerald-700"
                            : balance.net_cents < 0
                              ? "text-rose-700"
                              : "text-stone-500"
                        }`}
                      >
                        {balance.net_cents === 0
                          ? "à jour"
                          : balance.net_cents > 0
                            ? `on lui doit ${formatMoney(balance.net_cents, currency)}`
                            : `doit ${formatMoney(-balance.net_cents, currency)}`}
                      </span>
                      <p className="text-xs text-stone-400">
                        a payé {formatMoney(balance.paid_cents, currency)} · part{" "}
                        {formatMoney(balance.share_cents, currency)}
                      </p>
                    </span>
                  </li>
                ))}
              </ul>

              {transfers.length > 0 && (
                <div className="border-t border-stone-100 bg-stone-50 px-5 py-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Pour être quittes
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-stone-700">
                    {transfers.map((transfer) => (
                      <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                        {transfer.from_name} → {transfer.to_name} :{" "}
                        <strong>{formatMoney(transfer.amount_cents, currency)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ShareSummary text={summaryText} />
            </>
          )}
        </Card>
      </div>

      <Card title={`Dépenses sur place (${expenses.length})`}>
        {expenses.length === 0 ? (
          <EmptyState
            title="Rien de noté"
            hint="Les repas, les taxis, les billets — partagés ou personnels."
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {expenses.map((expense) => {
              const participants = expense.participant_ids;
              return (
                <li
                  key={expense.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">{expense.description}</p>
                    <p className="text-xs text-stone-500">
                      {CATEGORY_LABEL[expense.category]} · {formatDate(expense.spent_on)} · payé par{" "}
                      {nameById.get(expense.paid_by) ?? "quelqu'un"}
                    </p>
                    <p className="mt-1">
                      {expense.shared ? (
                        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                          {participants
                            ? `partagée entre ${participants
                                .map((userId) => nameById.get(userId) ?? "?")
                                .join(", ")}`
                            : "partagée entre tous"}
                        </Badge>
                      ) : (
                        <Badge>personnelle</Badge>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="tabular-nums text-stone-800">
                      {formatMoney(expense.amount_cents, currency)}
                    </p>
                    {editable && (
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="expense_id" value={expense.id} />
                        <button
                          type="submit"
                          className="text-xs text-stone-400 hover:text-rose-600"
                          aria-label={`Supprimer ${expense.description}`}
                        >
                          Supprimer
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <details className="border-t border-stone-100">
            <summary className="cursor-pointer select-none px-5 py-3.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
              Noter une dépense
            </summary>
            <ExpenseForm
              tripId={trip.id}
              currency={currency}
              defaultDate={trip.start_date}
              members={members.map((member) => ({ user_id: member.user_id, name: member.name }))}
              currentUserId={user.id}
            />
          </details>
        )}
      </Card>
    </div>
  );
}
