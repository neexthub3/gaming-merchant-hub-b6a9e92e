import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SlotegratorGame } from "./slotegrator-shared";
import { safeEqual } from "./slotegrator-shared";
import { slotegratorConfig, slotegratorRequest } from "./slotegrator-core";
import { balanceAdjustmentSchema, signedAdjustment } from "./admin-validation";
import { selectCatalog } from "./game-catalog";

const detail = (label: string, res: { status: number; body: unknown }) =>
  `${label}\nHTTP status: ${res.status}${res.status === 406 || res.status === 403 ? " (Slotegrator is blocking this server IP — ask them to whitelist it)" : res.status === 0 ? " (network error or missing settings)" : ""}\nResponse: ${typeof res.body === "string" ? res.body : JSON.stringify(res.body, null, 2)}`.slice(0, 4000);

export const getPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { currency: process.env["SLOTEGRATOR_CURRENCY"] || "USD" };
});

export const listGames = createServerFn({ method: "GET" })
  .inputValidator((input: { page: number; search?: string | undefined; provider?: string | undefined }) => z.object({ page: z.number().int().min(1).max(10000), search: z.string().max(200).optional(), provider: z.string().max(200).optional() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const cfg = slotegratorConfig();
      if (!cfg) throw new Error("Slotegrator settings missing: configure SLOTEGRATOR_MERCHANT_ID, SLOTEGRATOR_MERCHANT_KEY, SLOTEGRATOR_API_URL on the server");
      const { loadCatalog } = await import("./game-catalog.server");
      return { ok: true as const, error: null, ...selectCatalog(await loadCatalog(`${cfg.apiUrl}:${cfg.merchantId}`), data) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, games: [], providers: [], page: 1, pageCount: 0, total: 0, catalogTotal: 0 };
    }
  });

const launchSchema = z.object({ gameUuid: z.string().min(1).max(100), returnUrl: z.string().url().max(500), mobile: z.boolean() });

export const initDemo = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof launchSchema>) => launchSchema.parse(input))
  .handler(async ({ data }) => {
    const { launchGame } = await import("./game-launch.server");
    return launchGame(data, false);
  });

export const initReal = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof launchSchema>) => launchSchema.parse(input))
  .handler(async ({ data }) => {
    const { launchGame } = await import("./game-launch.server");
    return launchGame(data, true);
  });

export const gameDiagnostics = createServerFn({ method: "GET" })
  .inputValidator((input: { sessionId: string }) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { currentUser } = await import("./auth.server");
    const user = await currentUser();
    if (!user) return [];
    const { readCallbackLog } = await import("./filedb.server");
    const { ownCallbackEntries } = await import("./game-diagnostics");
    return ownCallbackEntries(await readCallbackLog(1000), user.id, data.sessionId);
  });

// ---------- Accounts ----------
const credSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,20}$/, "Username: 3–20 chars a-z 0-9 _"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const me = createServerFn({ method: "GET" }).handler(async () => {
  const { currentUser } = await import("./auth.server");
  const u = await currentUser();
  return u ? { id: u.id, username: u.username, balance: u.balance, isAdmin: u.isAdmin } : null;
});

export const register = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof credSchema>) => credSchema.parse(input))
  .handler(async ({ data }) => {
    const { registerUser } = await import("./auth.server");
    try {
      await registerUser(data.username, data.password);
      return { ok: true as const, error: null };
    } catch (e) {
      const m = (e as Error).message;
      return { ok: false as const, error: m === "USERNAME_TAKEN" ? "USERNAME_TAKEN" : m };
    }
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((input: z.infer<typeof credSchema>) => credSchema.parse(input))
  .handler(async ({ data }) => {
    const { loginUser } = await import("./auth.server");
    try {
      await loginUser(data.username, data.password);
      return { ok: true as const, error: null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutUser } = await import("./auth.server");
  await logoutUser();
  return { ok: true };
});

// ---------- Admin ----------
export const claimAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { requireUser, makeFirstAdmin } = await import("./auth.server");
    const user = await requireUser();
    const expected = process.env["ADMIN_SETUP_CODE"];
    if (!expected || expected.length < 12) return { ok: false as const, error: "ADMIN_SETUP_CODE is missing in .env or shorter than 12 characters" };
    if (!safeEqual(data.code, expected)) return { ok: false as const, error: "Wrong setup code" };
    try {
      await makeFirstAdmin(user.id);
      return { ok: true as const, error: null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const adminPlayers = createServerFn({ method: "POST" })
  .inputValidator((input: { search: string }) => z.object({ search: z.string().trim().max(100) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth.server");
    const { readDb } = await import("./filedb.server");
    await requireAdmin();
    const db = await readDb();
    const q = data.search.toLowerCase();
    return db.users
      .filter((u) => !q || u.username.includes(q))
      .slice(0, 200)
      .map((u) => ({ id: u.id, username: u.username, balance: u.balance, isAdmin: u.isAdmin }));
  });

export const adminAdjustBalance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => balanceAdjustmentSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth.server");
    const { adminAdjust } = await import("./wallet.server");
    const admin = await requireAdmin();
    const balance = await adminAdjust(data.playerId, signedAdjustment(data), data.note, admin.id);
    return { balance };
  });

export const adminInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth.server");
  const { dbFile, readDb } = await import("./filedb.server");
  await requireAdmin();
  const db = await readDb();
  return { dbFile: dbFile(), users: db.users.length, transactions: db.transactions.length, recent: db.transactions.slice(-20).reverse() };
});

export const adminApiCheck = createServerFn({ method: "POST" })
  .inputValidator((input: { check: "games" | "limits" | "self-validate" }) =>
    z.object({ check: z.enum(["games", "limits", "self-validate"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("./auth.server");
    await requireAdmin();
    if (!slotegratorConfig()) return { status: 0, ok: false, body: "Slotegrator settings are missing on the server" };
    const res =
      data.check === "games"
        ? await slotegratorRequest("GET", "/games", { page: "1" })
        : data.check === "limits"
          ? await slotegratorRequest("GET", "/limits")
          : await slotegratorRequest("POST", "/self-validate");
    let body = res.body;
    if (data.check === "games" && res.ok) {
      const b = res.body as { items?: unknown[]; _meta?: unknown };
      body = { games_on_page: b.items?.length ?? 0, meta: b._meta };
    }
    return { status: res.status, ok: res.ok, body: JSON.stringify(body, null, 2).slice(0, 4000) };
  });

// ---------- Callback diagnostics ----------
export const adminCallbackLog = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth.server");
  const { callbackLogFile, readCallbackLog } = await import("./filedb.server");
  await requireAdmin();
  return { file: callbackLogFile(), entries: JSON.parse(JSON.stringify(await readCallbackLog(50))) as Record<string, string>[] };
});

/** Sends a correctly signed "balance" call to this site's own public callback address, like Slotegrator would. */
export const adminCallbackTest = createServerFn({ method: "POST" }).handler(async () => {
  const { requireAdmin } = await import("./auth.server");
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { signedHeaders } = await import("./slotegrator-core");
  const admin = await requireAdmin();
  const cfg = slotegratorConfig();
  if (!cfg) return { ok: false, detail: "Slotegrator settings are missing in .env" };
  const origin = getRequestHeader("origin") ?? "";
  if (!/^https?:\/\/[^/]+$/.test(origin)) return { ok: false, detail: `Could not read this site's address (Origin header: "${origin}")` };
  const url = `${origin}/api/public/slotegrator/callback`;
  const params = { action: "balance", player_id: admin.id, currency: cfg.currency, session_id: "admin-test" };
  const headers = await signedHeaders(cfg, params);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const text = await res.text();
    let response: { balance?: number; error_code?: string } = {};
    try { response = JSON.parse(text); } catch { /* Report non-JSON replies as failures. */ }
    const ok = res.ok && !response.error_code && typeof response.balance === "number" && response.balance === admin.balance;
    return { ok, detail: `POST ${url}\nHTTP ${res.status}\nResponse: ${text.slice(0, 2000)}\nYour balance on file: ${admin.balance}` };
  } catch (e) {
    return { ok: false, detail: `POST ${url}\nNetwork error: ${(e as Error).message}\nThe server could not reach its own public address. Slotegrator will not reach it either.` };
  }
});

// ---------- Admin dashboard ----------
export const adminStats = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth.server");
  const { readDb, readGames } = await import("./filedb.server");
  const { summarize } = await import("./admin-stats");
  await requireAdmin();
  const [db, games] = await Promise.all([readDb(), readGames()]);
  return { ...summarize(db.users, db.transactions, games), knownGames: Object.keys(games).length };
});

/** Slotegrator merchant limits/balance (GET /limits), parsed for display. */
export const adminLimits = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("./auth.server");
  await requireAdmin();
  if (!slotegratorConfig()) return { ok: false as const, error: "Slotegrator settings are missing in .env", json: "" };
  const res = await slotegratorRequest("GET", "/limits");
  if (!res.ok) return { ok: false as const, error: detail("GET /limits failed", res), json: "" };
  return { ok: true as const, error: null, json: JSON.stringify(res.body ?? null) };
});
