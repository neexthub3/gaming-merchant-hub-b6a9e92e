import { describe, expect, it } from "vitest";
import { collectCatalog, selectCatalog } from "../lib/game-catalog";

describe("complete API catalog", () => {
  it("searches a game on a later API page and includes every provider", async () => {
    const games = await collectCatalog(async (page) => ({ games: [{ uuid: String(page), name: page === 3 ? "Dragon" : "Fruit", provider: `Provider ${page}` }], pageCount: 3, total: 3 }));
    const result = selectCatalog(games, { page: 1, search: "dragon" });
    expect(result.games.map((g) => g.uuid)).toEqual(["3"]);
    expect(result.providers).toEqual(["Provider 1", "Provider 2", "Provider 3"]);
  });
  it("filters by a provider that was absent from the first API page", () => {
    expect(selectCatalog([{ uuid: "1", name: "A", provider: "One" }, { uuid: "2", name: "B", provider: "Two" }], { page: 1, provider: "Two" }).games.map((g) => g.uuid)).toEqual(["2"]);
  });
  it("does not silently accept a failed later page", async () => {
    await expect(collectCatalog(async (page) => { if (page === 2) throw new Error("HTTP 406"); return { games: [], pageCount: 2, total: 1 }; })).rejects.toThrow("HTTP 406");
  });
});