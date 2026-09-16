import { describe, expect, it } from "vitest";
import { formatMoney, parseAmountToCents, percentOf, sumCents } from "./money";

describe("parseAmountToCents", () => {
  it("reads plain and decimal amounts", () => {
    expect(parseAmountToCents("89")).toBe(8_900);
    expect(parseAmountToCents("89.5")).toBe(8_950);
    expect(parseAmountToCents("0.99")).toBe(99);
  });

  it("reads the French decimal comma", () => {
    expect(parseAmountToCents("12,34")).toBe(1_234);
    expect(parseAmountToCents("1 234,56")).toBe(123_456);
  });

  it("treats a three-digit comma group as a thousands separator", () => {
    expect(parseAmountToCents("1,234")).toBe(123_400);
    expect(parseAmountToCents("1,234.56")).toBe(123_456);
  });

  it("handles mixed separators by the right-most one", () => {
    expect(parseAmountToCents("1.234,56")).toBe(123_456);
  });

  it("strips currency symbols and non-breaking spaces", () => {
    expect(parseAmountToCents("€ 1 500")).toBe(150_000);
    expect(parseAmountToCents("$42.10")).toBe(4_210);
  });

  it("rounds to the nearest cent rather than truncating", () => {
    expect(parseAmountToCents("10.005")).toBe(1_001);
  });

  it("rejects anything that is not a positive amount", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("   ")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("-12")).toBeNull();
    expect(parseAmountToCents("12.3.4")).toBeNull();
  });
});

describe("formatMoney", () => {
  /** French grouping uses narrow no-break spaces; compare on plain ones. */
  const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

  it("formats amounts the French way, with the symbol last", () => {
    expect(plain(formatMoney(150_000))).toBe("1 500 €");
    expect(plain(formatMoney(150_050))).toBe("1 500,50 €");
  });

  it("drops the decimals only when the amount is round", () => {
    expect(plain(formatMoney(2_500))).toBe("25 €");
    expect(plain(formatMoney(2_501))).toBe("25,01 €");
  });

  it("honours the currency", () => {
    expect(plain(formatMoney(2_500, "USD"))).toBe("25 $US");
  });
});

describe("sumCents and percentOf", () => {
  it("adds integer amounts without drift", () => {
    expect(sumCents([{ amount_cents: 10 }, { amount_cents: 20 }, { amount_cents: 1 }])).toBe(31);
    expect(sumCents([])).toBe(0);
  });

  it("clamps percentages and tolerates a zero denominator", () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(300, 200)).toBe(100);
    expect(percentOf(5, 0)).toBe(0);
  });
});
