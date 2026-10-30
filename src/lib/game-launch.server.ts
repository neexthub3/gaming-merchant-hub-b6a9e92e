import { slotegratorConfig, slotegratorRequest } from "./slotegrator-core";
import { currentUser } from "./auth.server";
import { redactDiagnostic, type GameDiagnostic } from "./game-diagnostics";
import { logCallback } from "./filedb.server";

export async function launchGame(data: { gameUuid: string; returnUrl: string; mobile: boolean }, real: boolean) {
  const started = Date.now();
  const sessionId = crypto.randomUUID();
  const user = await currentUser();
  const cfg = slotegratorConfig();
  const action = real ? "/games/init" : "/games/init-demo";
  const params: Record<string, string> = { game_uuid: data.gameUuid, device: data.mobile ? "mobile" : "desktop", return_url: data.returnUrl, language: "en" };
  if (real && user && cfg) Object.assign(params, { player_id: user.id, player_name: user.username, currency: cfg.currency, session_id: sessionId });
  const error = !cfg ? "Slotegrator settings missing on server" : real && !user ? "Not signed in. Please sign in again." : real && user && user.balance <= 0 ? "no_balance" : null;
  const res = error ? { ok: false, status: 0, body: { error, balance: user?.balance } } : await slotegratorRequest("POST", action, params);
  const url = (res.body as { url?: string } | null)?.url;
  const ok = res.ok && typeof url === "string";
  const diagnostic: GameDiagnostic = {
    id: crypto.randomUUID(), time: new Date().toISOString(), kind: "launch", action: `POST ${action}`, ok, status: res.status, ms: Date.now() - started,
    request: redactDiagnostic({ ...params, wallet_balance_before: user?.balance, mode: real ? "real" : "demo" }), response: redactDiagnostic(res.body),
    reason: ok ? undefined : error ?? `HTTP ${res.status}${res.status === 403 || res.status === 406 ? " — server IP may need whitelisting" : ""}; game launch failed`,
  };
  await logCallback({ ...diagnostic, player_id: user?.id ?? null, session_id: sessionId, game_uuid: data.gameUuid });
  return { ok, url: ok ? url : null, error: ok ? null : error ?? `${diagnostic.reason}\n${JSON.stringify(diagnostic.response, null, 2)}`, diagnostic, sessionId };
}