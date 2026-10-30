import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Plus, Minus, ShieldCheck, Search, Wallet, TrendingUp, Coins, Trophy, Users, Gamepad2, RefreshCw, Landmark } from "lucide-react";
import { toast } from "sonner";
import { usePlayer } from "@/hooks/use-player";
import { SiteHeader, useCurrency, formatMoney } from "@/components/SiteHeader";
import { ErrorDetails, errorText } from "@/components/ErrorDetails";
import { parseApiBalances } from "@/lib/admin-stats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminPlayers, adminAdjustBalance, adminInfo, adminApiCheck, claimAdmin, adminCallbackLog, adminCallbackTest, adminStats, adminLimits } from "@/lib/slotegrator.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Golden Reels — Administrator" },
      { name: "description", content: "Golden Reels administrator account and player balance management." },
      { property: "og:title", content: "Golden Reels — Administrator" },
      { property: "og:description", content: "Private player balance management for Golden Reels administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const { data: player, isPending, error } = usePlayer();
  return (
    <div className="min-h-screen">
      <SiteHeader authOpen={authOpen} setAuthOpen={setAuthOpen} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-primary" />
          <h1 className="font-display text-3xl text-gold">Administrator</h1>
        </div>
        {isPending ? (
          <Loader2 className="animate-spin" aria-label="Loading" />
        ) : error ? (
          <ErrorDetails title="Account check failed" detail={errorText(error)} />
        ) : !player ? (
          <Button variant="gold" onClick={() => setAuthOpen(true)}>Sign in</Button>
        ) : player.isAdmin ? (
          <>
            <ApiBalance />
            <Dashboard />
            <BalancePanel />
            <StorageInfo />
            <CallbackUrl />
            <CallbackLog />
            <ApiChecks />
          </>
        ) : (
          <AdminSetup />
        )}
        <Link to="/" className="inline-block text-sm text-muted-foreground">Back to games</Link>
      </main>
    </div>
  );
}

function AdminSetup() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setup = useServerFn(claimAdmin);
  const client = useQueryClient();
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const result = await setup({ data: { code } });
          if (!result.ok) {
            setError(result.error ?? "Setup denied");
            return;
          }
          setCode("");
          await client.invalidateQueries({ queryKey: ["player"] });
          toast.success("Administrator access enabled");
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-xl font-semibold">First administrator setup</h2>
      {error && <ErrorDetails title="Administrator setup denied" detail={error} onClose={() => setError(null)} />}
      <Label htmlFor="setup-code">Private setup code</Label>
      <Input id="setup-code" type="password" autoComplete="off" maxLength={200} required value={code} onChange={(e) => setCode(e.target.value)} />
      <Button variant="gold" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Enable administrator</Button>
    </form>
  );
}

function StorageInfo() {
  const info = useServerFn(adminInfo);
  const { data, error } = useQuery({ queryKey: ["admin-info"], queryFn: () => info() });
  if (error) return <ErrorDetails title="Database file could not be read" detail={errorText(error)} />;
  return (
    <section className="space-y-2 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Database file</h2>
      <p className="text-sm text-muted-foreground">All players, balances and game transactions are saved here on the server.</p>
      <code className="block break-all rounded bg-muted px-3 py-2 text-sm">{data?.dbFile ?? "…"}</code>
      {data && <p className="text-sm text-muted-foreground">{data.users} players · {data.transactions} transactions</p>}
    </section>
  );
}

function ApiChecks() {
  const check = useServerFn(adminApiCheck);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; detail: string; ok: boolean } | null>(null);
  async function run(kind: "games" | "limits" | "self-validate") {
    setBusy(kind);
    try {
      const r = await check({ data: { check: kind } });
      setResult({ ok: r.ok, title: `${kind}: HTTP ${r.status} ${r.ok ? "OK" : "FAILED"}`, detail: r.body });
    } catch (e) {
      setResult({ ok: false, title: `${kind}: request failed`, detail: errorText(e) });
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Slotegrator live check</h2>
      <div className="flex flex-wrap gap-2">
        {(["games", "limits", "self-validate"] as const).map((k) => (
          <Button key={k} variant="outline" disabled={!!busy} onClick={() => run(k)}>
            {busy === k && <Loader2 className="animate-spin" />}
            {k}
          </Button>
        ))}
      </div>
      {result &&
        (result.ok ? (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{result.title}{"\n"}{result.detail}</pre>
        ) : (
          <ErrorDetails title={result.title} detail={result.detail} onClose={() => setResult(null)} />
        ))}
    </section>
  );
}

function BalancePanel() {
  const list = useServerFn(adminPlayers);
  const adjust = useServerFn(adminAdjustBalance);
  const client = useQueryClient();
  const currency = useCurrency();
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; username: string; balance: number } | null>(null);
  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const { data: players, isPending, error, refetch } = useQuery({
    queryKey: ["admin-players", appliedSearch],
    queryFn: () => list({ data: { search: appliedSearch } }),
  });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setAdjustError(null);
    try {
      const result = await adjust({ data: { playerId: selected.id, amount: Number(amount), direction, note } });
      toast.success(`Balance updated: ${formatMoney(result.balance, currency)}`);
      setSelected(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-players"] }),
        client.invalidateQueries({ queryKey: ["player"] }),
        client.invalidateQueries({ queryKey: ["admin-info"] }),
      ]);
    } catch (err) {
      setAdjustError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Player balances</h2>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setAppliedSearch(search.trim()); }}>
          <Input aria-label="Search players" placeholder="Username" maxLength={100} value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outline" size="icon" aria-label="Search"><Search /></Button>
        </form>
      </div>
      {isPending ? (
        <Loader2 className="animate-spin" aria-label="Loading players" />
      ) : error ? (
        <div className="space-y-3">
          <ErrorDetails title="Player list is unavailable" detail={errorText(error)} />
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b text-muted-foreground">
              <tr><th className="py-3">Username</th><th className="px-4 py-3">Balance</th><th className="py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {players?.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-4 font-semibold">{p.username}{p.isAdmin && <span className="ml-2 text-xs text-primary">admin</span>}</td>
                  <td className="whitespace-nowrap px-4 py-4">{formatMoney(p.balance, currency)}</td>
                  <td className="py-4 text-right">
                    <Button variant="outline" onClick={() => { setSelected(p); setAmount(""); setNote(""); setDirection("add"); setAdjustError(null); }}>
                      Adjust balance
                    </Button>
                  </td>
                </tr>
              ))}
              {!players?.length && <tr><td colSpan={3} className="py-8 text-muted-foreground">No players found.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{selected?.username} — balance</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Current: {formatMoney(selected?.balance ?? 0, currency)}</p>
          {adjustError && <ErrorDetails title="Balance change rejected" detail={adjustError} onClose={() => setAdjustError(null)} />}
          <form className="space-y-4" onSubmit={submit}>
            <div className="flex gap-2">
              <Button type="button" aria-pressed={direction === "add"} variant={direction === "add" ? "gold" : "outline"} onClick={() => setDirection("add")}><Plus />Add</Button>
              <Button type="button" aria-pressed={direction === "subtract"} variant={direction === "subtract" ? "gold" : "outline"} onClick={() => setDirection("subtract")}><Minus />Subtract</Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-amount">Amount {currency}</Label>
              <Input id="balance-amount" type="number" step="0.01" min="0.01" max="100000000" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance-note">Reason</Label>
              <Input id="balance-note" minLength={3} maxLength={200} required value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button variant="gold" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />}Confirm adjustment</Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Shows the wallet callback address for whatever domain this site is opened on. */
function CallbackUrl() {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/api/public/slotegrator/callback`), []);
  return (
    <section className="space-y-2 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Slotegrator callback URL</h2>
      <p className="text-sm text-muted-foreground">Give this address to Slotegrator. It follows your current domain automatically.</p>
      <div className="flex gap-2">
        <code className="flex-1 break-all rounded bg-muted px-3 py-2 text-sm">{url}</code>
        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}>Copy</Button>
      </div>
    </section>
  );
}

function CallbackLog() {
  const load = useServerFn(adminCallbackLog);
  const test = useServerFn(adminCallbackTest);
  const { data, error, refetch, isFetching } = useQuery({ queryKey: ["callback-log"], queryFn: () => load(), refetchInterval: 10_000 });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const text = data ? data.entries.map((e) => JSON.stringify(e, null, 2)).join("\n\n") : "";
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h2 className="text-xl font-semibold">Game balance requests from Slotegrator</h2>
      <p className="text-sm text-muted-foreground">
        Every time a game asks for a player's balance or sends a bet/win, it shows here with the answer the site gave. If this list stays empty while a game is open, Slotegrator is not reaching your callback URL.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="gold"
          disabled={testing}
          onClick={async () => {
            setTesting(true);
            try {
              setTestResult(await test());
            } catch (e) {
              setTestResult({ ok: false, detail: errorText(e) });
            } finally {
              setTesting(false);
              void refetch();
            }
          }}
        >
          {testing && <Loader2 className="animate-spin" />}Test callback (my balance)
        </Button>
        <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
          {isFetching && <Loader2 className="animate-spin" />}Refresh
        </Button>
        {text && (
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}>Copy all</Button>
        )}
      </div>
      {testResult &&
        (testResult.ok ? (
          <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">Callback works{"\n"}{testResult.detail}</pre>
        ) : (
          <ErrorDetails title="Callback test failed" detail={testResult.detail} onClose={() => setTestResult(null)} />
        ))}
      {error && <ErrorDetails title="Callback log could not be read" detail={errorText(error)} />}
      {data && <p className="break-all text-xs text-muted-foreground">Log file: {data.file}</p>}
      {data && data.entries.length === 0 && <p className="text-sm">No requests received yet.</p>}
      {data && data.entries.length > 0 && (
        <div className="max-h-[32rem] space-y-2 overflow-auto">
          {data.entries.map((e, i) => (
            <pre key={i} className={`whitespace-pre-wrap break-all rounded border p-3 text-xs ${e["ok"] ? "bg-muted" : "border-destructive bg-destructive/10"}`}>
              {JSON.stringify(e, null, 2)}
            </pre>
          ))}
        </div>
      )}
    </section>
  );
}

function Dashboard() {
  const stats = useServerFn(adminStats);
  const currency = useCurrency();
  const { data, error, refetch, isFetching } = useQuery({ queryKey: ["admin-stats"], queryFn: () => stats(), refetchInterval: 15_000 });
  if (error) return <ErrorDetails title="Dashboard could not be loaded" detail={errorText(error)} />;
  const m = (n: number) => formatMoney(n, currency);
  const cards: { label: string; value: string; tone?: "good" | "bad"; icon: React.ReactNode }[] = data
    ? [
        { label: "Total player balance", value: m(data.totalBalance), icon: <Wallet className="size-4" /> },
        { label: "GGR (bets − wins)", value: m(data.ggr), tone: data.ggr >= 0 ? "good" : "bad", icon: <TrendingUp className="size-4" /> },
        { label: "Total bets", value: m(data.bets), icon: <Coins className="size-4" /> },
        { label: "Total wins paid", value: m(data.wins), icon: <Trophy className="size-4" /> },
        { label: "Balance added by admin", value: m(data.deposits), icon: <Plus className="size-4" /> },
        { label: "Balance removed by admin", value: m(data.withdrawals), icon: <Minus className="size-4" /> },
        { label: "Players", value: data.players.toLocaleString("bn-BD"), icon: <Users className="size-4" /> },
        { label: "Game rounds", value: data.rounds.toLocaleString("bn-BD"), icon: <Gamepad2 className="size-4" /> },
      ]
    : [];
  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl text-gold">Site overview (player wallets)</h2>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
          <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {data
          ? cards.map((c) => (
              <div key={c.label} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">{c.icon}{c.label}</div>
                <div className={`mt-2 break-words text-lg font-semibold tabular-nums md:text-xl ${c.tone === "good" ? "text-primary" : c.tone === "bad" ? "text-destructive" : ""}`}>{c.value}</div>
              </div>
            ))
          : Array.from({ length: 8 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />)}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-lg font-semibold">By provider</h3>
        <p className="mb-3 text-xs text-muted-foreground">Real-money bets and wins from the game provider. Refunded or rolled-back bets are not counted.</p>
        {data && data.providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No real-money rounds played yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3 text-right">Bets</th>
                  <th className="py-2 pr-3 text-right">Wins</th>
                  <th className="py-2 pr-3 text-right">GGR</th>
                  <th className="py-2 pr-3 text-right">Rounds</th>
                  <th className="py-2 pr-3 text-right">Players</th>
                  <th className="py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {data?.providers.map((p) => {
                  const share = data.bets > 0 ? (p.bets / data.bets) * 100 : 0;
                  return (
                    <tr key={p.provider} className="border-t">
                      <td className="py-2 pr-3 font-medium">{p.provider}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m(p.bets)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m(p.wins)}</td>
                      <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${p.ggr >= 0 ? "text-primary" : "text-destructive"}`}>{m(p.ggr)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.rounds}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{p.players}</td>
                      <td className="py-2 text-right">
                        <div className="ml-auto flex w-28 items-center gap-2">
                          <div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${share}%` }} /></div>
                          <span className="w-10 text-xs tabular-nums">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function ApiBalance() {
  const limits = useServerFn(adminLimits);
  const { data, error, refetch, isFetching, dataUpdatedAt } = useQuery({ queryKey: ["admin-limits"], queryFn: () => limits(), refetchInterval: 30_000 });
  const [providerSearch, setProviderSearch] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const parsed = data?.ok ? parseApiBalances(JSON.parse(data.json)) : null;
  const label = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const num = (n: number, cur: string) => `${n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? ` ${cur}` : ""}`;
  return (
    <section className="space-y-4 border-b pb-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl text-gold"><Landmark className="size-5" /> Slotegrator API balance</h2>
          <p className="text-xs text-muted-foreground">
            GET /limits · every 30 seconds{dataUpdatedAt ? ` · checked ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}{isFetching ? " · checking…" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {data?.ok && (
            <Button variant="outline" size="sm" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Hide raw" : "Raw reply"}</Button>
          )}
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
            <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>
      {error ? (
        <ErrorDetails title="API balance request failed" detail={errorText(error)} />
      ) : !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : !data.ok ? (
        <ErrorDetails title="Slotegrator API balance not available" detail={data.error ?? ""} />
      ) : parsed && parsed.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Slotegrator returned no balances.</p>
      ) : parsed ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(parsed.totals).flatMap(([cur, vals]) =>
              Object.entries(vals).map(([k, v]) => (
                <div key={`${cur}-${k}`} className="rounded-xl bg-primary/10 p-4">
                  <div className="text-xs text-muted-foreground">Total {label(k).toLowerCase()}</div>
                  <div className="mt-1 break-words text-xl font-semibold tabular-nums text-gold">{num(v, cur)}</div>
                </div>
              )),
            )}
          </div>
          <Input aria-label="Search API providers" placeholder="Search provider" value={providerSearch} onChange={(e) => setProviderSearch(e.target.value)} className="max-w-sm" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {parsed.rows.filter((r) => r.provider.toLowerCase().includes(providerSearch.toLowerCase().trim())).map((r, i) => (
              <div key={`${r.provider}-${i}`} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{r.provider}</span>
                  {r.currency && <span className="rounded bg-muted px-2 py-0.5 text-xs">{r.currency}</span>}
                </div>
                <dl className="mt-2 space-y-1 text-sm">
                  {Object.entries(r.values).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label(k)}</dt><dd className="font-medium tabular-nums">{num(v, r.currency)}</dd></div>
                  ))}
                  {Object.entries(r.text).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{label(k)}</dt><dd className="break-all text-right">{v}</dd></div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          {showRaw && <DataView value={JSON.parse(data.json)} />}
        </>
      ) : null}
    </section>
  );
}

function fmtCell(v: unknown) {
  if (typeof v === "number") return v.toLocaleString("bn-BD", { maximumFractionDigits: 2 });
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Shows any JSON: list of objects as a table, object as label/value cards. */
function DataView({ value }: { value: unknown }) {
  const list = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : null;
  if (list && list.length && list.every((r) => r && typeof r === "object")) {
    const cols = [...new Set(list.flatMap((r) => Object.keys(r as object)))];
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>{cols.map((c) => <th key={c} className="py-2 pr-3">{c}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i} className="border-t">
                {cols.map((c) => <td key={c} className="py-2 pr-3 tabular-nums">{fmtCell((r as Record<string, unknown>)[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (value && typeof value === "object") {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-muted p-3">
            <div className="text-xs text-muted-foreground">{k}</div>
            <div className="mt-1 break-all font-semibold tabular-nums">{fmtCell(v)}</div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm">{fmtCell(value)}</p>;
}
