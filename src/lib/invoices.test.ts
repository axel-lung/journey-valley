import { describe, expect, it } from "vitest";
import { billingFor, counts, suggestedAmount, type Invoice } from "./invoices";

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 1,
    trip_id: 1,
    agency_id: 1,
    quote_id: 1,
    reference: "FAC-2026-0001",
    token: "t",
    kind: "deposit",
    status: "issued",
    label: "",
    total_cents: 100_000,
    due_date: null,
    issued_at: "2026-01-01",
    opened_at: null,
    paid_at: null,
    payment_note: "",
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("counts", () => {
  it("counts issued and paid, never draft or cancelled", () => {
    expect(counts({ status: "issued" })).toBe(true);
    expect(counts({ status: "paid" })).toBe(true);
    expect(counts({ status: "draft" })).toBe(false);
    expect(counts({ status: "cancelled" })).toBe(false);
  });
});

describe("billingFor", () => {
  it("tells apart what is invoiced and what is actually in", () => {
    const billing = billingFor(398_000, [
      invoice({ id: 1, total_cents: 119_400, status: "paid" }),
      invoice({ id: 2, total_cents: 278_600, status: "issued" }),
    ]);

    expect(billing.invoiced_cents).toBe(398_000);
    expect(billing.paid_cents).toBe(119_400);
    expect(billing.outstanding_cents).toBe(278_600);
    expect(billing.remaining_cents).toBe(0);
    expect(billing.fully_invoiced).toBe(true);
  });

  it("ignores a cancelled invoice, which frees the amount again", () => {
    const billing = billingFor(398_000, [
      invoice({ id: 1, total_cents: 119_400, status: "cancelled" }),
    ]);
    expect(billing.invoiced_cents).toBe(0);
    expect(billing.remaining_cents).toBe(398_000);
  });

  it("ignores a draft, which has not been sent to anyone", () => {
    const billing = billingFor(398_000, [invoice({ total_cents: 119_400, status: "draft" })]);
    expect(billing.invoiced_cents).toBe(0);
  });

  it("never reports a negative remainder, even if over-invoiced by hand", () => {
    const billing = billingFor(100_000, [invoice({ total_cents: 150_000 })]);
    expect(billing.remaining_cents).toBe(0);
    expect(billing.fully_invoiced).toBe(true);
  });

  it("is not fully invoiced when nothing is sold yet", () => {
    expect(billingFor(0, []).fully_invoiced).toBe(false);
  });
});

describe("suggestedAmount", () => {
  const quote = { total_cents: 398_000, deposit_percent: 30 };

  it("proposes the deposit percentage of the quote", () => {
    const billing = billingFor(398_000, []);
    expect(suggestedAmount("deposit", quote, billing)).toBe(119_400);
  });

  it("proposes what is left for the balance", () => {
    const billing = billingFor(398_000, [invoice({ total_cents: 119_400, status: "paid" })]);
    expect(suggestedAmount("balance", quote, billing)).toBe(278_600);
  });

  it("never proposes more than what is left to invoice", () => {
    // Le dossier est déjà facturé à 95 % : un acompte de 30 % n'a plus lieu.
    const billing = billingFor(398_000, [invoice({ total_cents: 380_000, status: "paid" })]);
    expect(suggestedAmount("deposit", quote, billing)).toBe(18_000);
    expect(suggestedAmount("balance", quote, billing)).toBe(18_000);
  });
});
