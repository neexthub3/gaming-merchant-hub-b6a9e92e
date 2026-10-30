import type { SlotegratorGame } from "./slotegrator-shared";

export type CatalogPage = { games: SlotegratorGame[]; pageCount: number; total: number };

/** Never publish a partial catalog as complete when an upstream page fails. */
export async function collectCatalog(loadPage: (page: number) => Promise<CatalogPage>) {
  const first = await loadPage(1);
  if (!Number.isInteger(first.pageCount) || first.pageCount < 1 || first.pageCount > 10000) {
    throw new Error("Invalid Slotegrator game page count");
  }
  const pages: SlotegratorGame[][] = [first.games];
  for (let page = 2; page <= first.pageCount; page += 4) {
    const batch = await Promise.all(Array.from({ length: Math.min(4, first.pageCount - page + 1) }, (_, i) => loadPage(page + i)));
    pages.push(...batch.map((p) => p.games));
  }
  return [...new Map(pages.flat().map((g) => [g.uuid, g])).values()];
}

export function selectCatalog(games: SlotegratorGame[], input: { page: number; search?: string; provider?: string }) {
  const query = (input.search ?? "").trim().toLowerCase();
  const filtered = games.filter((g) => (!input.provider || g.provider === input.provider) && g.name.toLowerCase().includes(query));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 60));
  const page = Math.min(input.page, pageCount);
  return {
    games: filtered.slice((page - 1) * 60, page * 60), page, pageCount,
    total: filtered.length, catalogTotal: games.length,
    providers: [...new Set(games.map((g) => g.provider).filter((p): p is string => Boolean(p)))].sort(),
  };
}