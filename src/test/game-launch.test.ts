// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
vi.mock("../lib/auth.server", () => ({ currentUser: async () => ({ id: "p1", username: "funded", balance: 100 }) }));
vi.mock("../lib/filedb.server", () => ({ logCallback: vi.fn() }));
vi.mock("../lib/slotegrator-core", () => ({ slotegratorConfig: () => ({ currency: "USD" }), slotegratorRequest: async () => ({ ok: true, status: 200, body: { url: "https://game.test?token=private" } }) }));
import { launchGame } from "../lib/game-launch.server";
describe("launch diagnostics", () => {
  it("retains real launch URL for iframe but redacts it in copyable diagnostics", async () => {
    const res = await launchGame({ gameUuid: "g1", returnUrl: "https://site.test", mobile: false }, true);
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://game.test?token=private");
    expect(res.diagnostic.response).toEqual({ url: "[redacted]" });
    expect(res.diagnostic.request).toMatchObject({ wallet_balance_before: 100, session_id: "[redacted]", game_uuid: "g1" });
  });
});