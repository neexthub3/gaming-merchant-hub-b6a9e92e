import { describe, it, expect } from "vitest";
import { ownCallbackEntries, redactDiagnostic } from "../lib/game-diagnostics";
describe("game diagnostic privacy", () => {
  it("excludes other players, other sessions and unverified requests", () => {
    const entry = { verified: true, player_id: "p1", request: { session_id: "s1" }, response: { balance: 100 }, time: "now", action: "balance", ok: true };
    expect(ownCallbackEntries([entry, { ...entry, player_id: "p2" }, { ...entry, verified: false }, { ...entry, request: { session_id: "s2" } }], "p1", "s1")).toHaveLength(1);
  });
  it("redacts credentials and launch URLs recursively while retaining balance", () => {
    expect(redactDiagnostic({ balance: 100, response: { url: "https://game.test?token=private", merchant_key: "private", session_id: "private" }, headers: { "X-Sign": "private", Cookie: "private" } })).toEqual({ balance: 100, response: { url: "[redacted]", merchant_key: "[redacted]", session_id: "[redacted]" }, headers: { "X-Sign": "[redacted]", Cookie: "[redacted]" } });
  });
});