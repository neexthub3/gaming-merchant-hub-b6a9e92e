import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { gameDiagnostics } from "@/lib/slotegrator.functions";
import type { GameDiagnostic } from "@/lib/game-diagnostics";
import { ErrorDetails, errorText } from "./ErrorDetails";

export function GameDiagnostics({ open, onOpenChange, sessionId, name, entries }: { open: boolean; onOpenChange: (open: boolean) => void; sessionId: string; name: string; entries: GameDiagnostic[] }) {
  const load = useServerFn(gameDiagnostics);
  const [filter, setFilter] = useState("all");
  const { data, error, refetch, isFetching, dataUpdatedAt } = useQuery({ queryKey: ["game-diagnostics", sessionId], queryFn: () => load({ data: { sessionId } }), enabled: open && Boolean(sessionId), refetchInterval: open ? 3000 : false });
  const all = [...new Map([...entries, ...(data ?? [])].map((e) => [e.id, e])).values()].sort((a, b) => b.time.localeCompare(a.time));
  const visible = all.filter((e) => filter === "all" || (filter === "errors" ? !e.ok : e.kind === filter));
  async function copy(value: unknown) { try { await navigator.clipboard.writeText(JSON.stringify(value, null, 2)); toast.success("Copied"); } catch { toast.error("Copy failed. Select the details and copy manually."); } }
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="flex w-full flex-col gap-4 sm:max-w-2xl">
      <SheetHeader><SheetTitle>Game diagnostics — {name}</SheetTitle><SheetDescription>Live · {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "waiting"} · {all.length} entries</SheetDescription></SheetHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={!all.length} onClick={() => copy({ game: name, entries: all })}><Copy />Copy all</Button>
        <Button size="icon" variant="outline" title="Refresh logs" aria-label="Refresh logs" disabled={isFetching} onClick={() => refetch()}><RefreshCw className={isFetching ? "animate-spin" : ""} /></Button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Log type">{["all", "launch", "callback", "browser", "errors"].map((k) => <Button key={k} role="tab" aria-selected={filter === k} size="sm" variant={filter === k ? "gold" : "outline"} onClick={() => setFilter(k)}>{k}</Button>)}</div>
      {error && <ErrorDetails title="Live logs unavailable" detail={errorText(error)} />}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {!visible.length && <p className="text-sm text-muted-foreground">No {filter === "all" ? "log" : filter} entries yet.</p>}
        {visible.map((e) => <details key={e.id} open={!e.ok} className="rounded-lg border p-3">
          <summary className="cursor-pointer break-words text-sm font-semibold"><span className={e.ok ? "text-primary" : "text-destructive"}>{e.ok ? "OK" : "FAILED"}</span> · {e.action} · HTTP {e.status} · {e.ms}ms</summary>
          <div className="my-2 flex items-center justify-between gap-2"><time className="text-xs text-muted-foreground">{e.time}</time><Button size="icon" variant="ghost" title="Copy entry" aria-label={`Copy ${e.action}`} onClick={() => copy(e)}><Copy /></Button></div>
          <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{JSON.stringify(e, null, 2)}</pre>
        </details>)}
      </div>
    </SheetContent>
  </Sheet>;
}