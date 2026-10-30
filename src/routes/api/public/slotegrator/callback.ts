import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  buildSignString,
  hmacSha1Hex,
  parseFormBody,
  safeEqual,
  toList,
} from "@/lib/slotegrator-shared";
import { slotegratorConfig } from "@/lib/slotegrator-core";

// Seamless-wallet endpoint Slotegrator calls for balance / bet / win / refund / rollback.
// Give Slotegrator this URL: https://<your-domain>/api/public/slotegrator/callback
// Every call and our answer is written to data/callbacks.log (visible on the admin page).

const amount = z.coerce.number().min(0).max(1e9);
const playerId = z.string().uuid();
const txId = z.string().min(1).max(200);
const opt = z.string().max(200).optional();

export const Route = createFileRoute("/api/public/slotegrator/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const started = Date.now();
        const { logCallback } = await import("@/lib/filedb.server");
        const raw = await request.text();
        const contentType = request.headers.get("content-type") ?? "";
        const ip =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "";
        let body: Record<string, unknown> = {};
        const meta: Record<string, unknown> = {};
        let verified = false;

        const reply = async (out: Record<string, unknown>, reason?: string) => {
          const action = String(body["action"] ?? "");
          const entry = {
            id: crypto.randomUUID(),
            verified,
            action,
            player_id: body["player_id"] ?? null,
            ok: !out["error_code"],
            reason: reason ?? null,
            response: out,
            request: body,
            ip,
            contentType,
            ms: Date.now() - started,
            ...meta,
          };
          console.log(
            `[slotegrator-callback] ${action || "?"} player=${String(body["player_id"] ?? "-")} -> ${JSON.stringify(out)}${reason ? ` (${reason})` : ""}`,
          );
          await logCallback(entry);
          return Response.json(out);
        };
        const fail = (code: "INSUFFICIENT_FUNDS" | "INTERNAL_ERROR", description: string, reason?: string) =>
          reply({ error_code: code, error_description: description }, reason ?? description);

        const cfg = slotegratorConfig();
        if (!cfg) return fail("INTERNAL_ERROR", "Server not configured", "SLOTEGRATOR_* values missing in .env");

        try {
          body = contentType.includes("json") ? JSON.parse(raw || "{}") : parseFormBody(raw);
        } catch {
          meta["rawBody"] = raw.slice(0, 2000);
          return fail("INTERNAL_ERROR", "Bad body", "Request body could not be parsed");
        }

        const merchantId = request.headers.get("X-Merchant-Id") ?? "";
        const timestamp = request.headers.get("X-Timestamp") ?? "";
        const nonce = request.headers.get("X-Nonce") ?? "";
        const sign = (request.headers.get("X-Sign") ?? "").toLowerCase();
        if (!safeEqual(merchantId, cfg.merchantId)) {
          return fail("INTERNAL_ERROR", "Wrong merchant", "X-Merchant-Id does not match the server configuration");
        }
        const drift = Math.round(Date.now() / 1000 - Number(timestamp));
        meta["clockDriftSeconds"] = drift;
        if (!Number.isFinite(drift) || Math.abs(drift) > 60) {
          return fail("INTERNAL_ERROR", "Request expired", `X-Timestamp ${timestamp} is ${drift}s away from server clock (limit 60s) — fix the VPS clock (timedatectl set-ntp true)`);
        }
        const signString = buildSignString({
          ...(body as Record<string, string>),
          "X-Merchant-Id": merchantId,
          "X-Timestamp": timestamp,
          "X-Nonce": nonce,
        });
        const expected = await hmacSha1Hex(cfg.merchantKey, signString);
        if (!safeEqual(sign, expected)) {
          return fail("INTERNAL_ERROR", "Invalid signature", "X-Sign does not match — SLOTEGRATOR_MERCHANT_KEY in .env is probably wrong or outdated");
        }
        verified = true;

        const wallet = await import("@/lib/wallet.server");
        const action = String(body["action"] ?? "");

        try {
          const pid = playerId.safeParse(body["player_id"]);
          if (!pid.success) return fail("INTERNAL_ERROR", "Player not found", `player_id "${String(body["player_id"])}" is not a valid player id`);
          if (body["currency"] && body["currency"] !== cfg.currency) return fail("INTERNAL_ERROR", "Currency mismatch", `Callback currency ${String(body["currency"])} does not match configured currency ${cfg.currency}; align the merchant account and SLOTEGRATOR_CURRENCY`);

          let result: Record<string, unknown> | null = null;
          if (action === "balance") {
            result = await wallet.walletBalance(pid.data);
          } else if (action === "bet" || action === "win" || action === "refund") {
            const p = z
              .object({
                amount,
                transaction_id: txId,
                bet_transaction_id: opt,
                game_uuid: opt,
                session_id: opt,
                type: opt,
              })
              .parse(body);
            result = await wallet.walletTx({
              action,
              playerId: pid.data,
              amount: p.amount,
              txId: p.transaction_id,
              refTx: p.bet_transaction_id ?? "",
              game: p.game_uuid ?? "",
              session: p.session_id ?? "",
              type: p.type ?? "",
            });
          } else if (action === "rollback") {
            const p = z
              .object({ transaction_id: txId, game_uuid: opt, session_id: opt })
              .parse(body);
            const items = toList(body["rollback_transactions"]).map((t) => ({
              transaction_id: String(t["transaction_id"] ?? ""),
              action: String(t["action"] ?? ""),
              amount: String(t["amount"] ?? "0"),
            }));
            result = await wallet.walletRollback({
              playerId: pid.data,
              txId: p.transaction_id,
              items,
              game: p.game_uuid ?? "",
              session: p.session_id ?? "",
            });
          } else {
            return fail("INTERNAL_ERROR", "Unknown action", `Unknown action "${action}"`);
          }

          if (result?.["error"] === "INSUFFICIENT_FUNDS") {
            return fail("INSUFFICIENT_FUNDS", "Not enough money to continue playing");
          }
          if (result?.["error"]) {
            const { dbFile } = await import("@/lib/filedb.server");
            return fail("INTERNAL_ERROR", String(result["error"]), `${String(result["error"])} — looked in ${dbFile()}`);
          }
          if (typeof result?.["balance"] !== "number" || !Number.isFinite(result["balance"])) {
            return fail("INTERNAL_ERROR", "Wallet balance unavailable", "Wallet returned no valid balance; refused to replace it with 0");
          }
          const out: Record<string, unknown> = { balance: Number(result["balance"].toFixed(2)) };
          if (result?.["transaction_id"]) out["transaction_id"] = result["transaction_id"];
          if (result?.["rollback_transactions"]) out["rollback_transactions"] = result["rollback_transactions"];
          return reply(out);
        } catch (e) {
          console.error("Slotegrator callback error", action, e);
          return fail("INTERNAL_ERROR", "Internal error", `${(e as Error).message}`);
        }
      },
    },
  },
});
