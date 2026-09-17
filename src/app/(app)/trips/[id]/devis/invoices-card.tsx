"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ErrorNotice, Field, inputClass, secondaryButtonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TONE,
  type Billing,
  type Invoice,
  type InvoiceKind,
} from "@/lib/invoices";
import { formatMoney, type Currency } from "@/lib/money";
import {
  cancelInvoiceAction,
  createInvoiceAction,
  issueInvoiceAction,
  markInvoicePaidAction,
  type QuoteFormState,
} from "./actions";

/**
 * Les factures du dossier.
 *
 * L'acompte puis le solde, avec le reste à facturer toujours sous les yeux :
 * c'est ce chiffre qui empêche de facturer deux fois la même chose. La TVA
 * n'apparaît nulle part ici — voir la facture elle-même pour pourquoi.
 */
export function InvoicesCard({
  tripId,
  quoteId,
  invoices,
  billing,
  suggestions,
  currency,
}: {
  tripId: number;
  quoteId: number | null;
  invoices: Invoice[];
  billing: Billing;
  suggestions: Record<InvoiceKind, number>;
  currency: Currency;
}) {
  const [state, action] = useActionState<QuoteFormState, FormData>(createInvoiceAction, {});
  const [kind, setKind] = useState<InvoiceKind>(
    billing.invoiced_cents === 0 ? "deposit" : "balance",
  );

  const inThirtyDays = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-stone-100 px-5 py-4 text-sm sm:grid-cols-4">
        {[
          ["Vendu", billing.sold_cents, "text-stone-800"],
          ["Facturé", billing.invoiced_cents, "text-stone-800"],
          ["Encaissé", billing.paid_cents, "text-emerald-700"],
          ["Reste à facturer", billing.remaining_cents, "text-brand-700"],
        ].map(([label, value, tone]) => (
          <div key={String(label)}>
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
            <dd className={`mt-0.5 tabular-nums ${tone}`}>
              {formatMoney(Number(value), currency)}
            </dd>
          </div>
        ))}
      </dl>

      {billing.outstanding_cents > 0 && (
        <p className="border-b border-stone-100 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
          {formatMoney(billing.outstanding_cents, currency)} facturés et non encore réglés.
        </p>
      )}

      {invoices.length > 0 && (
        <ul className="divide-y divide-stone-100">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{invoice.reference}</span>
                  <Badge className={INVOICE_STATUS_TONE[invoice.status]}>
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </Badge>
                  <span className="text-xs text-stone-500">{INVOICE_KIND_LABEL[invoice.kind]}</span>
                </div>
                <p className="mt-0.5 text-sm tabular-nums text-stone-700">
                  {formatMoney(invoice.total_cents, currency)}
                  {invoice.due_date ? ` · échéance ${formatDate(invoice.due_date)}` : ""}
                </p>
                {invoice.paid_at && (
                  <p className="text-xs text-emerald-700">
                    Réglée le {formatDate(invoice.paid_at.slice(0, 10))}
                    {invoice.payment_note ? ` — ${invoice.payment_note}` : ""}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {invoice.status !== "draft" && (
                  <a
                    href={`/facture/${invoice.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className={secondaryButtonClass}
                  >
                    Voir la facture
                  </a>
                )}
                {invoice.status === "draft" && (
                  <form action={issueInvoiceAction}>
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <SubmitButton pendingLabel="Émission…">Émettre</SubmitButton>
                  </form>
                )}
                {invoice.status === "issued" && (
                  <form action={markInvoicePaidAction} className="flex items-center gap-2">
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <input
                      name="payment_note"
                      placeholder="Virement du 12/03"
                      aria-label={`Règlement de ${invoice.reference}`}
                      className={`${inputClass} w-40`}
                    />
                    <SubmitButton className={secondaryButtonClass} pendingLabel="…">
                      Marquer réglée
                    </SubmitButton>
                  </form>
                )}
                {invoice.status !== "cancelled" && invoice.status !== "paid" && (
                  <form action={cancelInvoiceAction}>
                    <input type="hidden" name="invoice_id" value={invoice.id} />
                    <button type="submit" className="text-xs text-stone-400 hover:text-rose-600">
                      {invoice.status === "draft" ? "Supprimer" : "Annuler"}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {billing.remaining_cents > 0 ? (
        <form action={action} className="space-y-4 border-t border-stone-100 px-5 py-4">
          <input type="hidden" name="trip_id" value={tripId} />
          {quoteId && <input type="hidden" name="quote_id" value={quoteId} />}

          <div className="flex flex-wrap gap-2">
            {(["deposit", "balance"] as const).map((entry) => (
              <label
                key={entry}
                className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition ${
                  kind === entry
                    ? "bg-brand-600 text-white ring-brand-600"
                    : "bg-white text-stone-600 ring-stone-300"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={entry}
                  checked={kind === entry}
                  onChange={() => setKind(entry)}
                  className="sr-only"
                />
                {INVOICE_KIND_LABEL[entry]}
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Montant (${currency})`}
              hint={
                kind === "deposit"
                  ? `Acompte proposé : ${formatMoney(suggestions.deposit, currency)}. Modifiable.`
                  : `Reste dû : ${formatMoney(suggestions.balance, currency)}.`
              }
            >
              {/* La clé force le champ à se réinitialiser quand on change de
                  type : un montant d'acompte ne doit pas rester affiché sur un
                  solde. */}
              <input
                key={kind}
                name="amount"
                inputMode="decimal"
                defaultValue={(suggestions[kind] / 100).toFixed(2).replace(".", ",")}
                className={inputClass}
              />
            </Field>
            <Field label="Échéance">
              <input name="due_date" type="date" defaultValue={inThirtyDays} className={inputClass} />
            </Field>
          </div>

          <ErrorNotice message={state.error} />
          <SubmitButton pendingLabel="Création…">Préparer la facture</SubmitButton>
        </form>
      ) : (
        <p className="border-t border-stone-100 px-5 py-4 text-sm text-stone-500">
          {billing.sold_cents > 0
            ? "Tout est facturé sur ce dossier."
            : "Posez un prix de vente pour pouvoir facturer."}
        </p>
      )}
    </div>
  );
}
