import { describe, expect, it } from "vitest";
import {
  dossierMargin,
  lineMargin,
  marginByMonth,
  roundToEuro,
  sellPriceFor,
  totalMargin,
} from "./margin";

const line = (cost: number, sell: number) => ({ amount_cents: cost, agency_quote_cents: sell });

describe("lineMargin", () => {
  it("separates the two rates a quote can be read with", () => {
    // Acheté 800 €, vendu 1 000 € : 200 € de marge, soit 20 % du prix de vente
    // mais 25 % du prix d'achat.
    const margin = lineMargin(line(80_000, 100_000));
    expect(margin.margin_cents).toBe(20_000);
    expect(margin.margin_percent).toBe(20);
    expect(margin.markup_percent).toBe(25);
  });

  it("earns nothing on a line with no sell price", () => {
    expect(lineMargin(line(80_000, 0))).toMatchObject({
      sell_cents: 0,
      margin_cents: -80_000,
      margin_percent: 0,
    });
  });

  it("reports a loss when the line sells under its cost", () => {
    const margin = lineMargin(line(100_000, 90_000));
    expect(margin.margin_cents).toBe(-10_000);
    expect(margin.margin_percent).toBe(-11);
  });
});

describe("dossierMargin", () => {
  const bookings = [line(80_000, 100_000), line(40_000, 50_000)];
  const booked = { stage: "booked" } as const;
  const planning = { stage: "planning" } as const;

  it("adds the priced lines up when no package price is set", () => {
    const margin = dossierMargin({ agency_quote_cents: 0, ...booked }, bookings);
    expect(margin.basis).toBe("lines");
    expect(margin.sell_cents).toBe(150_000);
    expect(margin.margin_cents).toBe(30_000);
    expect(margin.partial).toBe(false);
  });

  it("lets a package price override the lines", () => {
    // Le forfait négocié est en dessous de la somme des lignes : c'est lui qui
    // est facturé, donc lui qui fait la marge.
    const margin = dossierMargin({ agency_quote_cents: 140_000, ...booked }, bookings);
    expect(margin.basis).toBe("package");
    expect(margin.sell_cents).toBe(140_000);
    expect(margin.margin_cents).toBe(20_000);
  });

  it("flags a file where a line has no sell price yet", () => {
    const margin = dossierMargin({ agency_quote_cents: 0, ...booked }, [...bookings, line(30_000, 0)]);
    expect(margin.unpriced_lines).toBe(1);
    expect(margin.partial).toBe(true);
    // Le coût de la ligne non valorisée compte, sa vente non : la marge
    // affichée est un plancher.
    expect(margin.cost_cents).toBe(150_000);
    expect(margin.margin_cents).toBe(0);
  });

  it("does not flag an unpriced line under a package price", () => {
    const margin = dossierMargin({ agency_quote_cents: 200_000, ...booked }, [
      ...bookings,
      line(30_000, 0),
    ]);
    expect(margin.partial).toBe(false);
    expect(margin.margin_cents).toBe(50_000);
  });

  it("warns that a package margin is a ceiling until the file is booked", () => {
    // Le forfait est vendu 2 000 €, mais seul le vol est acheté : annoncer
    // 1 200 € de marge ferait croire à un dossier deux fois plus rentable
    // qu'il ne le sera une fois l'hôtel payé.
    const margin = dossierMargin({ agency_quote_cents: 200_000, ...planning }, [line(80_000, 0)]);
    expect(margin.margin_cents).toBe(120_000);
    expect(margin.partial).toBe(true);
    expect(margin.partial_reason).toBe("purchases_incomplete");
  });

  it("settles the package margin once everything is booked", () => {
    const margin = dossierMargin({ agency_quote_cents: 200_000, ...booked }, [line(80_000, 0)]);
    expect(margin.partial).toBe(false);
    expect(margin.partial_reason).toBe("none");
  });

  it("says when nothing is sold yet", () => {
    expect(dossierMargin({ agency_quote_cents: 0, ...booked }, []).basis).toBe("none");
    expect(dossierMargin({ agency_quote_cents: 0, ...booked }, [line(80_000, 0)]).basis).toBe("none");
  });
});

describe("sellPriceFor", () => {
  it("divides by one minus the rate, and never multiplies by one plus it", () => {
    // 1 000 € d'achat à 15 % de marque se vend 1 176,47 €, pas 1 150 €.
    expect(sellPriceFor(100_000, 15)).toBe(117_647);
    expect(lineMargin(line(100_000, 117_647)).margin_percent).toBe(15);
  });

  it("returns the cost itself at zero margin", () => {
    expect(sellPriceFor(100_000, 0)).toBe(100_000);
  });

  it("refuses to divide by zero on an absurd target", () => {
    expect(Number.isFinite(sellPriceFor(100_000, 100))).toBe(true);
    expect(sellPriceFor(0, 20)).toBe(0);
  });
});

describe("roundToEuro", () => {
  it("presents a quote at the euro", () => {
    expect(roundToEuro(117_647)).toBe(117_600);
    expect(roundToEuro(117_650)).toBe(117_700);
  });
});

describe("marginByMonth", () => {
  it("groups files by their departure month, in order", () => {
    const months = marginByMonth([
      { start_date: "2026-03-14", margin: lineMargin(line(80_000, 100_000)) },
      { start_date: "2026-01-02", margin: lineMargin(line(40_000, 50_000)) },
      { start_date: "2026-03-30", margin: lineMargin(line(20_000, 30_000)) },
    ]);

    expect(months.map((month) => month.month)).toEqual(["2026-01", "2026-03"]);
    expect(months[1]).toMatchObject({ files: 2, sell_cents: 130_000, margin_cents: 30_000 });
  });
});

describe("totalMargin", () => {
  it("recomputes the rate on the totals rather than averaging rates", () => {
    // Un petit dossier à 50 % ne doit pas tirer la moyenne d'un gros à 10 %.
    const total = totalMargin([lineMargin(line(90_000, 100_000)), lineMargin(line(500, 1_000))]);
    expect(total.sell_cents).toBe(101_000);
    expect(total.margin_percent).toBe(10);
  });
});
