import { describe, expect, it } from "vitest";
import { costsByZone, describeVat, vatOnMargin } from "./vat";

const eu = (cost: number) => ({ amount_cents: cost, zone: "eu" as const });
const outside = (cost: number) => ({ amount_cents: cost, zone: "non_eu" as const });

describe("vatOnMargin", () => {
  it("extracts the tax from the margin instead of adding it", () => {
    // 1 000 € de marge TTC en UE : la TVA est 1000 × 20/120 = 166,67 €, pas
    // 200 €. Se tromper de sens surestime la taxe de 20 %.
    const vat = vatOnMargin({ marginGrossCents: 100_000, costs: { eu: 500_000, non_eu: 0 } });
    expect(vat.vat_cents).toBe(16_667);
    expect(vat.margin_net_cents).toBe(83_333);
    expect(vat.mixed).toBe(false);
  });

  it("exempts a package performed entirely outside the EU", () => {
    const vat = vatOnMargin({ marginGrossCents: 100_000, costs: { eu: 0, non_eu: 500_000 } });
    expect(vat.vat_cents).toBe(0);
    expect(vat.exempt_margin_cents).toBe(100_000);
    expect(vat.margin_net_cents).toBe(100_000);
  });

  it("splits a mixed package by the cost of each zone", () => {
    // 1 200 € d'achats en UE, 2 800 € hors UE : 30 % de la marge est taxable.
    const vat = vatOnMargin({
      marginGrossCents: 100_000,
      costs: { eu: 120_000, non_eu: 280_000 },
    });
    expect(vat.mixed).toBe(true);
    expect(vat.taxable_margin_cents).toBe(30_000);
    expect(vat.exempt_margin_cents).toBe(70_000);
    expect(vat.vat_cents).toBe(5_000);
    expect(vat.margin_net_cents).toBe(95_000);
  });

  it("keeps the two shares adding up to the margin, whatever the rounding", () => {
    const vat = vatOnMargin({ marginGrossCents: 33_333, costs: { eu: 1, non_eu: 2 } });
    expect(vat.taxable_margin_cents + vat.exempt_margin_cents).toBe(33_333);
  });

  it("owes nothing on a loss", () => {
    const vat = vatOnMargin({ marginGrossCents: -20_000, costs: { eu: 500_000, non_eu: 0 } });
    expect(vat.vat_cents).toBe(0);
    expect(vat.margin_net_cents).toBe(-20_000);
    expect(vat.no_vat_due).toBe(true);
  });

  it("owes nothing when the agency is not subject to the scheme", () => {
    const vat = vatOnMargin({
      marginGrossCents: 100_000,
      costs: { eu: 500_000, non_eu: 0 },
      subjectToVat: false,
    });
    expect(vat.vat_cents).toBe(0);
    expect(vat.margin_net_cents).toBe(100_000);
  });

  it("treats a file with no purchases as fully taxable rather than free", () => {
    const vat = vatOnMargin({ marginGrossCents: 100_000, costs: { eu: 0, non_eu: 0 } });
    expect(vat.taxable_margin_cents).toBe(100_000);
    expect(vat.vat_cents).toBe(16_667);
  });

  it("honours a rate other than the French standard one", () => {
    const vat = vatOnMargin({
      marginGrossCents: 100_000,
      costs: { eu: 1, non_eu: 0 },
      ratePercent: 10,
    });
    expect(vat.vat_cents).toBe(9_091);
  });
});

describe("costsByZone", () => {
  it("adds each line up under its own zone", () => {
    expect(costsByZone([eu(10_000), outside(20_000), eu(5_000)])).toEqual({
      eu: 15_000,
      non_eu: 20_000,
    });
  });

  it("counts a line with no zone as EU, to provision the tax rather than miss it", () => {
    expect(costsByZone([{ amount_cents: 10_000 }])).toEqual({ eu: 10_000, non_eu: 0 });
  });
});

describe("describeVat", () => {
  it("names the mixed case, which is the one people get wrong", () => {
    const vat = vatOnMargin({ marginGrossCents: 100_000, costs: { eu: 1, non_eu: 1 } });
    expect(describeVat(vat)).toContain("ventilée au prorata des coûts");
  });

  it("says plainly when nothing is due", () => {
    const vat = vatOnMargin({ marginGrossCents: 100_000, costs: { eu: 0, non_eu: 1 } });
    expect(describeVat(vat)).toContain("exonérée");
  });
});
