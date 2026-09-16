import { describe, expect, it } from "vitest";
import { estimateComponentPackagePrice, estimatePackagePrice } from "./package";
import { offlineProvider } from "./search/offline-provider";
import { evaluateWatch } from "./watch";
import type { SearchResult } from "./search/types";

describe("estimatePackagePrice", () => {
  it("says nothing when there is nothing priced", () => {
    expect(estimatePackagePrice([]).components).toBe(0);
    expect(estimatePackagePrice([{ type: "flight", amount_cents: 0 }]).components).toBe(0);
  });

  it("keeps the low, mid and high bands in order and above cost", () => {
    const estimate = estimatePackagePrice([
      { type: "flight", amount_cents: 60_000 },
      { type: "stay", amount_cents: 80_000 },
    ]);

    expect(estimate.your_cost_cents).toBe(140_000);
    expect(estimate.low_cents).toBeGreaterThan(estimate.your_cost_cents);
    expect(estimate.mid_cents).toBeGreaterThan(estimate.low_cents);
    expect(estimate.high_cents).toBeGreaterThan(estimate.mid_cents);
    expect(estimate.mid_difference_cents).toBe(estimate.mid_cents - estimate.your_cost_cents);
  });

  it("marks activities up harder than flights, as agencies do", () => {
    const flight = estimateComponentPackagePrice("flight", 100_000);
    const activity = estimateComponentPackagePrice("activity", 100_000);
    expect(activity).toBeGreaterThan(flight);
  });

  it("counts only the components that carry a price", () => {
    const estimate = estimatePackagePrice([
      { type: "flight", amount_cents: 50_000 },
      { type: "activity", amount_cents: 0 },
    ]);
    expect(estimate.components).toBe(1);
  });
});

describe("the offline search provider", () => {
  const query = {
    kind: "flight" as const,
    origin: "Lyon",
    destination: "Lisbonne",
    start_date: "2026-12-01",
    end_date: "2026-12-06",
    travellers: 2,
  };

  it("never claims to be live", () => {
    expect(offlineProvider.live).toBe(false);
  });

  it("gives the same answers for the same query", async () => {
    const first = await offlineProvider.search(query);
    const second = await offlineProvider.search(query);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("gives different answers for a different trip", async () => {
    const other = await offlineProvider.search({ ...query, destination: "Oslo" });
    const base = await offlineProvider.search(query);
    expect(other[0].id).not.toBe(base[0].id);
  });

  it("returns results cheapest first, with a package estimate above the price", async () => {
    const results = await offlineProvider.search(query);
    const prices = results.map((result) => result.price_cents);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    for (const result of results) {
      expect(result.price_cents).toBeGreaterThan(0);
      expect(result.package_price_cents).toBeGreaterThan(result.price_cents);
      expect(result.source).toBe("offline");
    }
  });

  it("scales flights with the number of travellers", async () => {
    const solo = await offlineProvider.search({ ...query, travellers: 1 });
    const pair = await offlineProvider.search({ ...query, travellers: 2 });
    expect(pair[0].price_cents).toBeGreaterThan(solo[0].price_cents);
  });

  it("prices a stay by its nights", async () => {
    const short = await offlineProvider.search({
      ...query,
      kind: "stay",
      end_date: "2026-12-03",
    });
    const long = await offlineProvider.search({ ...query, kind: "stay", end_date: "2026-12-11" });
    expect(long[0].nights).toBeGreaterThan(short[0].nights ?? 0);
  });
});

describe("evaluateWatch", () => {
  const result = (id: string, price: number): SearchResult => ({
    id,
    kind: "flight",
    vendor: "Test Air",
    title: "Lyon → Lisbonne",
    description: "",
    start_at: "2026-12-01",
    end_at: null,
    nights: null,
    price_cents: price,
    currency: "EUR",
    package_price_cents: price * 1.1,
    source: "offline",
  });

  it("picks the cheapest result", () => {
    const evaluation = evaluateWatch({ target_cents: 0, last_price_cents: null }, [
      result("a", 30_000),
      result("b", 24_000),
      result("c", 28_000),
    ]);
    expect(evaluation.best_price_cents).toBe(24_000);
    expect(evaluation.best?.id).toBe("b");
  });

  it("says nothing happened on a first check with no target", () => {
    const evaluation = evaluateWatch({ target_cents: 0, last_price_cents: null }, [
      result("a", 30_000),
    ]);
    expect(evaluation.dropped).toBe(false);
    expect(evaluation.notable).toBe(false);
  });

  it("spots a drop and measures it", () => {
    const evaluation = evaluateWatch({ target_cents: 0, last_price_cents: 30_000 }, [
      result("a", 24_500),
    ]);
    expect(evaluation.dropped).toBe(true);
    expect(evaluation.drop_cents).toBe(5_500);
    expect(evaluation.notable).toBe(true);
  });

  it("does not call a rise a drop", () => {
    const evaluation = evaluateWatch({ target_cents: 0, last_price_cents: 20_000 }, [
      result("a", 26_000),
    ]);
    expect(evaluation.dropped).toBe(false);
    expect(evaluation.drop_cents).toBe(0);
    expect(evaluation.notable).toBe(false);
  });

  it("fires on the target even at the very first check", () => {
    const evaluation = evaluateWatch({ target_cents: 25_000, last_price_cents: null }, [
      result("a", 24_000),
    ]);
    expect(evaluation.target_reached).toBe(true);
    expect(evaluation.notable).toBe(true);
  });

  it("treats the target as inclusive", () => {
    const evaluation = evaluateWatch({ target_cents: 25_000, last_price_cents: null }, [
      result("a", 25_000),
    ]);
    expect(evaluation.target_reached).toBe(true);
  });

  it("copes with a check that found nothing", () => {
    const evaluation = evaluateWatch({ target_cents: 25_000, last_price_cents: 30_000 }, []);
    expect(evaluation.best).toBeNull();
    expect(evaluation.notable).toBe(false);
  });
});
