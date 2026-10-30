// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withDb, readCallbackLog } from "../lib/filedb.server";
import { signedHeaders } from "../lib/slotegrator-core";
import { walletBalance } from "../lib/wallet.server";

vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
import { Route } from "../routes/api/public/slotegrator/callback";
const handler = (Route as unknown as { server: { handlers: { POST: (input: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
const playerId = "00000000-0000-4000-8000-000000000001";
let dir = "";
let cfg = { merchantId: "", merchantKey: "" };

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "callback-"));
  vi.stubEnv("DATA_DIR", dir);
  cfg = { merchantId: crypto.randomUUID(), merchantKey: crypto.randomUUID() };
  vi.stubEnv("SLOTEGRATOR_MERCHANT_ID", cfg.merchantId);
  vi.stubEnv("SLOTEGRATOR_MERCHANT_KEY", cfg.merchantKey);
  vi.stubEnv("SLOTEGRATOR_API_URL", "https://example.test/v1");
  vi.stubEnv("SLOTEGRATOR_CURRENCY", "USD");
  await withDb((db) => { db.users.push({ id: playerId, username: "funded", balance: 150.25, isAdmin: false, salt: "", passHash: "", createdAt: "" }); });
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

async function call(action: string, extra: Record<string, string> = {}, invalidSignature = false) {
  const params = { action, player_id: playerId, currency: "USD", ...extra };
  const headers = await signedHeaders(cfg, params);
  if (invalidSignature) headers["X-Sign"] = "invalid";
  const res = await handler({ request: new Request("http://localhost/api/public/slotegrator/callback", { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() }) });
  return res.json();
}
describe("funded player callback", () => {
  it("returns the funded file balance instead of zero", async () => {
    expect(await call("balance")).toEqual({ balance: 150.25 });
  });
  it("reads bets and wins back from the same file", async () => {
    expect((await call("bet", { amount: "30", transaction_id: "bet1" })).balance).toBe(120.25);
    expect((await call("win", { amount: "55.50", transaction_id: "win1" })).balance).toBe(175.75);
    expect((await call("balance")).balance).toBe(175.75);
    expect((await walletBalance(playerId)).balance).toBe(175.75);
  });
  it("returns a detailed error for a missing player, not zero", async () => {
    const out = await call("balance", { player_id: "00000000-0000-4000-8000-000000000002" });
    expect(out.error_description).toBe("PLAYER_NOT_FOUND");
    expect(out).not.toHaveProperty("balance");
  });
  it("rejects mismatched currency without modifying balance", async () => {
    expect((await call("bet", { currency: "BDT", amount: "10", transaction_id: "bad" })).error_description).toBe("Currency mismatch");
    expect((await walletBalance(playerId)).balance).toBe(150.25);
  });
  it("rejects unsigned requests without persisting signature diagnostics", async () => {
    expect((await call("balance", {}, true)).error_description).toBe("Invalid signature");
    const logs = await readCallbackLog();
    expect(logs[0]).not.toHaveProperty("signExpected");
    expect(logs[0]).not.toHaveProperty("signReceived");
  });
});