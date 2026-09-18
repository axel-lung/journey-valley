import { describe, expect, it } from "vitest";
import {
  describeCost,
  describePurchase,
  deriveRate,
  formatForeign,
  formatRate,
  hasForeign,
  isPurchaseCurrency,
  PURCHASE_CURRENCIES,
  RATE_SCALE,
} from "./exchange";

describe("deriveRate", () => {
  it("relie les deux montants saisis", () => {
    // 45 000 THB payés 1 170 € : 1 THB vaut 0,026 €.
    expect(deriveRate(4_500_000, 117_000)).toBe(0.026 * RATE_SCALE);
  });

  it("garde de la précision sur une devise faible", () => {
    // 10 000 000 VND payés 370 € : 0,000037 €. Six décimales n'auraient laissé
    // que deux chiffres significatifs, d'où les milliardièmes.
    expect(deriveRate(1_000_000_000, 37_000)).toBe(37_000);
    expect(formatRate(deriveRate(1_000_000_000, 37_000))).toContain("0,000037");
  });

  it("ne dérive pas sur de gros montants", () => {
    // 500 000 € en bahts : le produit dépasse l'entier sûr d'un flottant, d'où
    // le calcul en BigInt.
    const rate = deriveRate(1_923_076_900, 50_000_000);
    expect(rate).toBeGreaterThan(0.025 * RATE_SCALE);
    expect(rate).toBeLessThan(0.027 * RATE_SCALE);
  });

  it("ne rend pas de taux quand il n'y a rien à relier", () => {
    expect(deriveRate(0, 117_000)).toBe(0);
    expect(deriveRate(4_500_000, 0)).toBe(0);
    expect(deriveRate(-1, 10)).toBe(0);
  });
});

describe("formatRate", () => {
  it("montre plus de décimales quand le taux est petit", () => {
    expect(formatRate(1.0934 * RATE_SCALE)).toBe("1,0934");
    expect(formatRate(0.026 * RATE_SCALE)).toBe("0,026");
    expect(formatRate(37_000)).toBe("0,000037");
  });

  it("ne montre rien plutôt qu'un zéro trompeur", () => {
    expect(formatRate(0)).toBe("");
  });
});

describe("formatForeign", () => {
  it("écrit un montant dans sa devise", () => {
    expect(formatForeign(4_500_000, "THB")).toMatch(/45\s?000/);
    expect(formatForeign(4_500_000, "THB")).toMatch(/THB|฿/);
  });

  it("ne casse pas une page sur un code inconnu", () => {
    expect(formatForeign(10_000, "XXXX")).toContain("XXXX");
  });
});

describe("hasForeign", () => {
  it("reconnaît une ligne qui garde son montant d'origine", () => {
    expect(
      hasForeign({ foreign_currency: "THB", foreign_amount_cents: 4_500_000, fx_rate_nanos: 1 }),
    ).toBe(true);
  });

  it("ignore une ligne payée dans la devise du dossier", () => {
    expect(hasForeign({ foreign_currency: "", foreign_amount_cents: 0, fx_rate_nanos: 0 })).toBe(
      false,
    );
    expect(hasForeign(null)).toBe(false);
    expect(hasForeign({ foreign_currency: "THB", foreign_amount_cents: 0, fx_rate_nanos: 0 })).toBe(
      false,
    );
  });
});

describe("describePurchase", () => {
  it("donne de quoi retrouver la ligne du relevé", () => {
    const described = describePurchase({
      foreign_currency: "THB",
      foreign_amount_cents: 4_500_000,
      fx_rate_nanos: deriveRate(4_500_000, 117_000),
    });
    expect(described).toMatch(/45\s?000/);
    expect(described).toContain("au taux de 0,026");
  });

  it("se contente du montant quand le taux manque", () => {
    const described = describePurchase({
      foreign_currency: "THB",
      foreign_amount_cents: 4_500_000,
      fx_rate_nanos: 0,
    });
    expect(described).not.toContain("taux");
  });
});

describe("describeCost", () => {
  it("montre ce qui est sorti du compte, puis d'où ça vient", () => {
    const line = describeCost(117_000, "EUR", {
      foreign_currency: "THB",
      foreign_amount_cents: 4_500_000,
      fx_rate_nanos: deriveRate(4_500_000, 117_000),
    });
    // L'espace des milliers en français est une insécable fine, d'où `\s`.
    expect(line).toMatch(/^1\s?170/);
    expect(line).toContain("·");
    expect(line).toMatch(/45\s?000/);
  });

  it("reste un simple montant pour un achat local", () => {
    expect(describeCost(117_000, "EUR", null)).toBe(describeCost(117_000, "EUR", undefined));
    expect(describeCost(117_000, "EUR", null)).not.toContain("·");
  });
});

describe("PURCHASE_CURRENCIES", () => {
  it("couvre les devises d'achat d'une agence française", () => {
    for (const code of ["EUR", "USD", "THB", "MAD", "JPY", "VND"]) {
      expect(isPurchaseCurrency(code)).toBe(true);
    }
  });

  it("refuse ce qui n'est pas dans la liste", () => {
    expect(isPurchaseCurrency("XXX")).toBe(false);
    expect(isPurchaseCurrency("")).toBe(false);
  });

  it("n'a ni doublon ni code mal formé", () => {
    expect(new Set(PURCHASE_CURRENCIES).size).toBe(PURCHASE_CURRENCIES.length);
    for (const code of PURCHASE_CURRENCIES) expect(code).toMatch(/^[A-Z]{3}$/);
  });
});
