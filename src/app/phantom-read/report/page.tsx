"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GameState } from "@/types/game";

function pct(num: number, den: number): string {
  if (den <= 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

export default function PhantomReadReportPage() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId");
  const playerId = searchParams.get("playerId");
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;

    const load = async () => {
      try {
        const res = await fetch(`/api/game/state?roomId=${encodeURIComponent(roomId)}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { snapshot: { state: GameState } } | { error: string };
        if (!res.ok || "error" in data) {
          setError("Failed to load report.");
          return;
        }
        setState(data.snapshot.state);
        setError(null);
      } catch {
        setError("Failed to load report.");
      }
    };

    void load();
  }, [roomId]);

  const me = useMemo(() => {
    if (!state || !playerId) return null;
    return state.players[playerId] ?? null;
  }, [state, playerId]);

  const opponent = useMemo(() => {
    if (!state || !playerId) return null;
    const id = state.playerIds.find((x) => x !== playerId);
    return id ? state.players[id] : null;
  }, [state, playerId]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#142556,transparent_45%),radial-gradient(circle_at_80%_10%,#4a220f,transparent_35%),#050814] px-6 py-10 text-cyan-50 sm:px-10">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Link href="/phantom-read" className="inline-flex rounded-full border border-cyan-300/40 px-4 py-1 text-sm hover:bg-cyan-200/10">
          Back to Match
        </Link>

        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Battle Report</p>
          <h1 className="text-4xl font-bold tracking-tight">Phantom Read Results</h1>
          <p className="text-cyan-100/85">Room: {roomId ?? "-"}</p>
        </header>

        {error ? <p className="text-rose-300">{error}</p> : null}

        {state && me ? (
          <section className="space-y-3 rounded-xl border border-cyan-300/30 bg-slate-950/60 p-6">
            <p>
              Winner:{" "}
              <span className="font-semibold">
                {state.winnerPlayerId ? state.players[state.winnerPlayerId]?.name : "Draw"}
              </span>
            </p>
            <p>
              End Reason: <span className="font-semibold">{state.endReason ?? "-"}</span>
            </p>
            <p>
              You: <span className="font-semibold">{me.name}</span>
              {opponent ? <> vs <span className="font-semibold">{opponent.name}</span></> : null}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-lg border border-cyan-200/20 bg-slate-900/50 p-4">
                <p className="text-sm text-cyan-200">Hit Accuracy</p>
                <p className="text-2xl font-bold">{pct(me.stats.hitsLanded, me.stats.attacksThrown)}</p>
                <p className="text-xs text-cyan-100/70">
                  {me.stats.hitsLanded} / {me.stats.attacksThrown}
                </p>
              </article>
              <article className="rounded-lg border border-cyan-200/20 bg-slate-900/50 p-4">
                <p className="text-sm text-cyan-200">Parry Success Rate</p>
                <p className="text-2xl font-bold">{pct(me.stats.parrySuccess, me.stats.parryAttempts)}</p>
                <p className="text-xs text-cyan-100/70">
                  {me.stats.parrySuccess} / {me.stats.parryAttempts}
                </p>
              </article>
              <article className="rounded-lg border border-cyan-200/20 bg-slate-900/50 p-4">
                <p className="text-sm text-cyan-200">Times Got Feinted</p>
                <p className="text-2xl font-bold">{me.stats.gotFeinted}</p>
              </article>
              <article className="rounded-lg border border-cyan-200/20 bg-slate-900/50 p-4">
                <p className="text-sm text-cyan-200">Best Combo</p>
                <p className="text-2xl font-bold">{me.stats.bestCombo}</p>
              </article>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

