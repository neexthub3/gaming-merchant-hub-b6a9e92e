import { collectCatalog } from "./game-catalog";
import { slotegratorRequest } from "./slotegrator-core";
import { rememberGames } from "./filedb.server";
import type { SlotegratorGame } from "./slotegrator-shared";

let cache: { key: string; expires: number; games: SlotegratorGame[] } | undefined;
let pending: { key: string; promise: Promise<SlotegratorGame[]> } | undefined;

export async function loadCatalog(key: string) {
  if (cache?.key === key && cache.expires > Date.now()) return cache.games;
  if (pending?.key === key) return pending.promise;
  const promise = collectCatalog(async (page) => {
    const res = await slotegratorRequest("GET", "/games", { page: String(page) });
    if (!res.ok) throw new Error(`GET /games page ${page}\nHTTP ${res.status}${res.status === 403 || res.status === 406 ? " — ask Slotegrator to whitelist this server IP" : ""}\n${JSON.stringify(res.body, null, 2).slice(0, 4000)}`);
    const body = res.body as { items?: SlotegratorGame[]; _meta?: { pageCount?: number; totalCount?: number } };
    if (!Array.isArray(body.items)) throw new Error(`GET /games page ${page}: missing items array`);
    return { games: body.items, pageCount: body._meta?.pageCount ?? Number(res.headers?.get("X-Pagination-Page-Count") ?? 1), total: body._meta?.totalCount ?? 0 };
  }).then(async (games) => {
    await rememberGames(games);
    cache = { key, games, expires: Date.now() + 5 * 60_000 };
    return games;
  });
  pending = { key, promise };
  try { return await promise; }
  finally { if (pending?.promise === promise) pending = undefined; }
}