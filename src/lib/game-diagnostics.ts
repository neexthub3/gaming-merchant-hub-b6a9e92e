export type DiagnosticValue = null | string | number | boolean | DiagnosticValue[] | { [key: string]: DiagnosticValue };
export type GameDiagnostic = {
  id: string; time: string; kind: "launch" | "callback" | "browser";
  action: string; ok: boolean; status: number; ms: number;
  request: DiagnosticValue; response: DiagnosticValue; reason?: string | undefined;
};

/** Diagnostic exports must never contain credentials or game access URLs. */
export function redactDiagnostic(value: unknown): DiagnosticValue {
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, /secret|password|passhash|salt|authorization|cookie|token|signature|x-sign|merchant.key|session_id|url|rawbody|signexpected|signreceived|signstring/i.test(key) ? "[redacted]" : redactDiagnostic(v)]));
  if (typeof value === "string") return value.replace(/https?:\/\/[^\s"<>]+/g, "[URL redacted]").replace(/Bearer\s+\S+/gi, "[redacted]");
  return typeof value === "number" || typeof value === "boolean" ? value : null;
}

export function ownCallbackEntries(entries: Record<string, unknown>[], playerId: string, sessionId: string): GameDiagnostic[] {
  return entries.filter((e) => {
    const req = e["request"] as Record<string, unknown> | undefined;
    return e["verified"] === true && e["player_id"] === playerId && req?.["session_id"] === sessionId;
  }).map((e) => ({
    id: String(e["id"] ?? `${e["time"]}-${e["action"]}-${e["ms"]}`), time: String(e["time"]), kind: "callback",
    action: String(e["action"]), ok: e["ok"] === true, status: 200, ms: Number(e["ms"] ?? 0),
    request: redactDiagnostic(e["request"]), response: redactDiagnostic(e["response"]), reason: typeof e["reason"] === "string" ? String(redactDiagnostic(e["reason"])) : undefined,
  }));
}