// Pure money summary used by the admin dashboard (kept separate so it can be unit-tested).
export type StatTx = { userId: string; action: string; amount: number; game: string; rolledBack: boolean };
export type ProviderRow = { provider: string; bets: number; wins: number; ggr: number; rounds: number; players: number; games: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(
  users: { balance: number }[],
  txs: StatTx[],
  games: Record<string, { name: string; provider: string }>,
) {
  let bets = 0, wins = 0, deposits = 0, withdrawals = 0, rounds = 0;
  const byProvider = new Map<string, { bets: number; wins: number; rounds: number; players: Set<string>; games: Set<string> }>();
  for (const t of txs) {
    if (t.action === "admin") {
      if (t.amount >= 0) deposits += t.amount;
      else withdrawals += -t.amount;
      continue;
    }
    if (t.rolledBack || (t.action !== "bet" && t.action !== "win")) continue;
    const provider = games[t.game]?.provider || (t.game ? "Unknown provider" : "Unknown game");
    const row = byProvider.get(provider) ?? { bets: 0, wins: 0, rounds: 0, players: new Set(), games: new Set() };
    if (t.action === "bet") {
      bets += t.amount;
      row.bets += t.amount;
      row.rounds += 1;
      rounds += 1;
    } else {
      wins += t.amount;
      row.wins += t.amount;
    }
    row.players.add(t.userId);
    if (t.game) row.games.add(t.game);
    byProvider.set(provider, row);
  }
  const providers: ProviderRow[] = [...byProvider.entries()]
    .map(([provider, v]) => ({
      provider,
      bets: r2(v.bets),
      wins: r2(v.wins),
      ggr: r2(v.bets - v.wins),
      rounds: v.rounds,
      players: v.players.size,
      games: v.games.size,
    }))
    .sort((a, b) => b.bets - a.bets);
  return {
    players: users.length,
    totalBalance: r2(users.reduce((s, u) => s + u.balance, 0)),
    bets: r2(bets),
    wins: r2(wins),
    ggr: r2(bets - wins),
    rounds,
    deposits: r2(deposits),
    withdrawals: r2(withdrawals),
    providers,
  };
}

// ---------- Slotegrator API balance (GET /limits) ----------
export type ApiBalanceRow = { provider: string; currency: string; values: Record<string, number>; text: Record<string, string> };

const NAME_KEYS = ["provider", "provider_name", "name", "title", "game_provider", "aggregator"];
const CURRENCY_KEYS = ["currency", "currency_code"];

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

/** Accepts the /limits body in any common shape: array, {items:[...]}, {data:[...]} or {Provider: {...}}. */
export function parseApiBalances(body: unknown) {
  let list: Record<string, unknown>[] = [];
  if (Array.isArray(body)) list = body as Record<string, unknown>[];
  else if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["data", "limits", "providers"]) {
      const nested = o[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) return parseApiBalances(nested);
    }
    const inner = [o["items"], o["data"], o["limits"], o["providers"]].find(Array.isArray) as Record<string, unknown>[] | undefined;
    if (inner) list = inner;
    else if (Object.values(o).every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      list = Object.entries(o).map(([k, v]) => ({ provider: k, ...(v as Record<string, unknown>) }));
    } else list = [o];
  }
  const rows: ApiBalanceRow[] = list
    .filter((r) => r && typeof r === "object" && !Array.isArray(r))
    .map((r) => {
      const nameKey = NAME_KEYS.find((k) => typeof r[k] === "string");
      const curKey = CURRENCY_KEYS.find((k) => typeof r[k] === "string");
      const values: Record<string, number> = {};
      const text: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        if (k === nameKey || k === curKey) continue;
        const n = toNumber(v);
        if (n !== null && !/(^id$|_id$|time|date|updated|created)/i.test(k)) values[k] = n;
        else if (v !== null && v !== undefined) text[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
      }
      return { provider: nameKey ? String(r[nameKey]) : "Merchant", currency: curKey ? String(r[curKey]) : "", values, text };
    });
  const totals: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const t = (totals[r.currency] ??= {});
    for (const [k, v] of Object.entries(r.values)) t[k] = r2((t[k] ?? 0) + v);
  }
  return { rows, totals };
}
