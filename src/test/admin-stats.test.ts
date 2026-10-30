import { describe, expect, it } from "vitest";
import { summarize } from "@/lib/admin-stats";

const games = { g1: { name: "Book", provider: "Pragmatic" }, g2: { name: "Aviator", provider: "Spribe" } };
const tx = (action: string, amount: number, game = "g1", rolledBack = false, userId = "u1") => ({ userId, action, amount, game, rolledBack });

describe("admin dashboard totals", () => {
  it("total player balance is the sum of all balances", () => {
    expect(summarize([{ balance: 100 }, { balance: 50.25 }], [], games).totalBalance).toBe(150.25);
  });
  it("GGR is bets minus wins, per provider and overall", () => {
    const s = summarize([], [tx("bet", 30), tx("win", 10), tx("bet", 20, "g2"), tx("win", 50, "g2")], games);
    expect(s.ggr).toBe(-10);
    expect(s.providers.find((p) => p.provider === "Pragmatic")?.ggr).toBe(20);
    expect(s.providers.find((p) => p.provider === "Spribe")?.ggr).toBe(-30);
  });
  it("refunded or rolled-back bets are not counted", () => {
    const s = summarize([], [tx("bet", 30, "g1", true), tx("bet", 5)], games);
    expect(s.bets).toBe(5);
  });
  it("admin balance changes are counted as added/removed, not as bets", () => {
    const s = summarize([], [tx("admin", 100, ""), tx("admin", -40, "")], games);
    expect(s.deposits).toBe(100);
    expect(s.withdrawals).toBe(40);
    expect(s.bets).toBe(0);
  });
});

import { parseApiBalances } from "@/lib/admin-stats";
describe("Slotegrator API balance", () => {
  it("reads nested API provider limits without mixing currencies", () => {
    const r = parseApiBalances({ data: { providers: [{ provider: "One", currency: "USD", balance: "25.50" }, { provider: "Two", currency: "BDT", balance: 75 }] } });
    expect(r.rows.map((v) => v.provider)).toEqual(["One", "Two"]);
    expect(r.totals.USD?.balance).toBe(25.5);
    expect(r.totals.BDT?.balance).toBe(75);
  });
  it("adds up each provider's balance per currency", () => {
    const r = parseApiBalances([
      { provider: "Pragmatic", currency: "BDT", balance: "1000.50", limit: 5000 },
      { provider: "Spribe", currency: "BDT", balance: 250, limit: "2000" },
      { provider: "Evolution", currency: "USD", balance: 10 },
    ]);
    expect(r.rows).toHaveLength(3);
    expect(r.totals["BDT"]).toEqual({ balance: 1250.5, limit: 7000 });
    expect(r.totals["USD"]).toEqual({ balance: 10 });
  });
  it("reads a provider-keyed object", () => {
    const r = parseApiBalances({ Pragmatic: { balance: 5 }, Spribe: { balance: 7 } });
    expect(r.rows.map((x) => x.provider)).toEqual(["Pragmatic", "Spribe"]);
    expect(r.totals[""]).toEqual({ balance: 12 });
  });
});
