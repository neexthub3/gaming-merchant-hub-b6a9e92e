import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Play, Search, X, FileText } from "lucide-react";

import heroImg from "@/assets/hero.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/SiteHeader";
import { initDemo, initReal, listGames } from "@/lib/slotegrator.functions";
import { usePlayer } from "@/hooks/use-player";
import { ErrorDetails, errorText } from "@/components/ErrorDetails";
import type { SlotegratorGame } from "@/lib/slotegrator-shared";
import { GameDiagnostics } from "@/components/GameDiagnostics";
import { redactDiagnostic, type GameDiagnostic } from "@/lib/game-diagnostics";

const gamesQuery = (page: number, search: string, provider: string | null) =>
  queryOptions({
    queryKey: ["games", page, search, provider],
    queryFn: () => listGames({ data: { page, search, provider: provider ?? undefined } }),
    staleTime: 5 * 60_000,
  });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "গোল্ডেন রিলস — ফ্রি ডেমো স্লট গেম" },
      { name: "description", content: "শত শত ক্যাসিনো গেম ফ্রি ডেমো মোডে খেলুন। কোনো টাকা লাগবে না।" },
      { property: "og:title", content: "গোল্ডেন রিলস — ফ্রি ডেমো স্লট গেম" },
      { property: "og:description", content: "শত শত ক্যাসিনো গেম ফ্রি ডেমো মোডে খেলুন। কোনো টাকা লাগবে না।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [authOpen, setAuthOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ name: string; url: string } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logSession, setLogSession] = useState("");
  const [logName, setLogName] = useState("");
  const [logEntries, setLogEntries] = useState<GameDiagnostic[]>([]);
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<{ title: string; detail: string } | null>(null);
  const startDemo = useServerFn(initDemo);
  const startReal = useServerFn(initReal);
  const { data: player } = usePlayer();
  function beginLogs(name: string) { setLogName(name); setLogSession(""); setLogEntries([]); }
  function browserLog(action: string, response: unknown, ok = false) {
    const entry: GameDiagnostic = { id: crypto.randomUUID(), time: new Date().toISOString(), kind: "browser", action, ok, status: 0, ms: 0, request: {}, response: redactDiagnostic(response) };
    setLogEntries((entries) => [...entries, entry].slice(-200));
  }

  async function playReal(game: SlotegratorGame) {
    if (!player) {
      setAuthOpen(true);
      return;
    }
    setLaunching(game.uuid);
    beginLogs(game.name);
    setLaunchError(null);
    try {
      const res = await startReal({
        data: { gameUuid: game.uuid, returnUrl: window.location.href, mobile: window.innerWidth < 768 },
      });
      setLogSession(res.sessionId);
      setLogEntries([res.diagnostic]);
      if (res.ok && res.url) setPlaying({ name: game.name, url: res.url });
      else if (res.error === "no_balance")
        setLaunchError({ title: "আপনার ব্যালেন্স নেই", detail: `Balance is 0. Ask the administrator to add balance.\nGame: ${game.name} (${game.uuid})` });
      else setLaunchError({ title: `"${game.name}" আসল টাকায় চালু করা যায়নি`, detail: res.error ?? "Unknown error" });
    } catch (e) {
      browserLog("Launch request failed", errorText(e));
      setLaunchError({ title: `"${game.name}" আসল টাকায় চালু করা যায়নি`, detail: errorText(e) });
    } finally {
      setLaunching(null);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { setAppliedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, isLoading, error: gamesError } = useQuery(gamesQuery(page, appliedSearch, provider));
  const games = data?.games ?? [];
  const providers = (data?.providers ?? []).filter((p) => p.toLowerCase().includes(providerSearch.trim().toLowerCase()));
  const filtered = games;

  async function play(game: SlotegratorGame) {
    setLaunching(game.uuid);
    beginLogs(game.name);
    setLaunchError(null);
    try {
      const res = await startDemo({
        data: {
          gameUuid: game.uuid,
          returnUrl: window.location.href,
          mobile: window.innerWidth < 768,
        },
      });
      setLogSession(res.sessionId);
      setLogEntries([res.diagnostic]);
      if (res.ok && res.url) setPlaying({ name: game.name, url: res.url });
      else setLaunchError({ title: `"${game.name}" ডেমো চালু করা যায়নি`, detail: res.error ?? "Unknown error" });
    } catch (e) {
      browserLog("Demo request failed", errorText(e));
      setLaunchError({ title: `"${game.name}" ডেমো চালু করা যায়নি`, detail: errorText(e) });
    } finally {
      setLaunching(null);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader authOpen={authOpen} setAuthOpen={setAuthOpen} />
      <header className="relative overflow-hidden border-b">
        <img
          src={heroImg}
          alt="সোনালি স্লট মেশিন ও কয়েন"
          width={1920}
          height={800}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-hero-fade" />
        <div className="relative mx-auto max-w-7xl px-6 py-20 md:py-28">
          <p className="mb-3 text-base font-semibold text-emerald">
            শুধু ডেমো · কোনো টাকা লাগবে না
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-tight md:text-7xl">
            <span className="text-gold">Golden Reels</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">
            সেরা প্রোভাইডারদের শত শত গেম — এক ক্লিকে ফ্রি খেলুন।
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="font-display text-2xl font-semibold">
            গেম লবি
            {data?.ok && data.total > 0 && (
              <span className="ml-3 align-middle text-sm font-normal text-muted-foreground">
                মোট {data.total.toLocaleString("bn-BD")}টি
              </span>
            )}
          </h2>
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="গেম খুঁজুন…"
              className="bg-card pl-9"
            />
          </div>
        </div>

        <div className="mb-8 space-y-3">
          <Input aria-label="Search providers" placeholder="প্রোভাইডার খুঁজুন…" value={providerSearch} onChange={(e) => setProviderSearch(e.target.value)} className="max-w-sm" />
          <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto" role="tablist" aria-label="Game providers">
            <Chip active={!provider} onClick={() => { setProvider(null); setPage(1); }}>
              সব প্রোভাইডার
            </Chip>
            {providers.map((p) => (
              <Chip key={p} active={provider === p} onClick={() => { setProvider(p); setPage(1); }}>
                {p}
              </Chip>
            ))}
          </div>
          {providerSearch && providers.length === 0 && <p className="text-sm text-muted-foreground">কোনো প্রোভাইডার পাওয়া যায়নি।</p>}
        </div>

        {launchError && (
          <div className="mb-6">
            <ErrorDetails title={launchError.title} detail={launchError.detail} onClose={() => setLaunchError(null)} />
            <Button className="mt-2" variant="outline" size="sm" onClick={() => setLogOpen(true)}><FileText />Game diagnostics</Button>
          </div>
        )}

        {isLoading ? (
          <Grid>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-card" />
            ))}
          </Grid>
        ) : !data?.ok ? (
          <ErrorDetails
            title="গেমগুলো আনা যাচ্ছে না"
            detail={gamesError ? errorText(gamesError) : (data?.error ?? "Unknown error")}
          />
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">কোনো গেম পাওয়া যায়নি।</p>
        ) : (
          <Grid>
            {filtered.map((g) => (
              <GameCard
                key={g.uuid}
                game={g}
                loading={launching === g.uuid}
                onPlay={() => play(g)}
                onReal={() => playReal(g)}
              />
            ))}
          </Grid>
        )}

        {data?.ok && data.pageCount > 1 && (
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="আগের পাতা"
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm text-muted-foreground">
              পাতা {(data.page ?? page).toLocaleString("bn-BD")} / {data.pageCount.toLocaleString("bn-BD")}
            </span>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= data.pageCount}
              onClick={() => setPage((p) => p + 1)}
              aria-label="পরের পাতা"
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </main>

      {playing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-overlay backdrop-blur-sm">
          <div className="flex items-center justify-between border-b bg-card px-4 py-3">
            <p className="min-w-0 truncate font-display font-semibold text-gold">{playing.name}</p>
            <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="icon" title="Game diagnostics" onClick={() => setLogOpen(true)} aria-label="Open game diagnostics"><FileText /></Button>
            <Button variant="ghost" size="icon" onClick={() => setPlaying(null)} aria-label="বন্ধ করুন">
              <X />
            </Button>
            </div>
          </div>
          <iframe
            src={playing.url}
            title={playing.name}
            className="h-full w-full flex-1 border-0"
            allow="autoplay; fullscreen"
            allowFullScreen
            onLoad={() => browserLog("Game frame loaded", { event: "load" }, true)}
            onError={() => browserLog("Game frame error", { event: "error" })}
          />
        </div>
      )}
      <GameDiagnostics open={logOpen} onOpenChange={setLogOpen} sessionId={logSession} name={logName} entries={logEntries} />
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      role="tab"
      aria-selected={active}
      variant={active ? "gold" : "outline"}
      onClick={onClick}
      size="sm"
    >
      {children}
    </Button>
  );
}

function GameCard({
  game,
  loading,
  onPlay,
  onReal,
}: {
  game: SlotegratorGame;
  loading: boolean;
  onPlay: () => void;
  onReal: () => void;
}) {
  return (
    <div className="group relative aspect-[3/4] overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-gold">
      {game.image ? (
        <img
          src={game.image}
          alt={game.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full items-center justify-center p-4 text-center font-display text-gold">
          {game.name}
        </div>
      )}
      <div className="absolute inset-0 bg-card-fade" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="truncate text-sm font-semibold">{game.name}</p>
        {game.provider && <p className="truncate text-xs text-muted-foreground">{game.provider}</p>}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-overlay opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="gold" onClick={onReal} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Play />}
          আসল খেলুন
        </Button>
        <Button variant="outline" size="sm" onClick={onPlay} disabled={loading}>
          ডেমো
        </Button>
      </div>
    </div>
  );
}
